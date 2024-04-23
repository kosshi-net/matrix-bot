import { Bot } from "./bot.mjs";
import { parse_command } from "./parse_command.mjs";
import { parse, TextNode, HTMLElement } from "node-html-parser";

const doc_col_1 = 45

class Command {
	ready_on: number;
	name: string;
	usage: string;
	fn: Function;
	description: string;

	filter: {
		level:number,
		console:boolean,
		room : {
			[index:string]: boolean,
		}
		user : {
			[index:string]: boolean,
		}
	};

	constructor(usage: string, fn: (this:Bot, ctx:CommandContext)=>Promise<void>) {
		this.ready_on = 0;
		this.usage = usage;
		this.name = usage.split(" ")[0];
		this.fn = fn;
		this.description = "";
		this.filter = {
			level: 100,
			console: false,
			room: {
				any: false,
			},
			user: {
				any: false,
			},
		};
		return this;
	}

	/* I heard you liked object-oriented code */

	set_description(text:string) {
		this.description = text;
		return this;
	}
/*  
	Disabled for now, unclear if necessary

	allow_console() {
		this.filter.console = true;
		return this;
	}
	deny_console() {
		this.filter.console = false;
		return this;
	}
*/
	set_level(level: number) {
		this.filter.level = level;
		return this;
	}

	allow_room(room: string) {
		this.filter.room[room] = true;
		return this;
	}

	deny_room(room: string) {
		this.filter.room[room] = false;
		return this;
	}

	allow_user(user: string) {
		this.filter.user[user] = true;
		return this;
	}

	deny_user(user: string) {
		this.filter.user[user] = false;
		return this;
	}

	allow_any_room() {
		this.filter.room.any = true;
		return this;
	}
	deny_any_room() {
		this.filter.room.any = false;
		return this;
	}

	allow_any_user() {
		this.filter.user.any = true;
		return this;
	}
	deny_any_user() {
		this.filter.user.any = false;
		return this;
	}
	register(manager: CommandManager) {
		manager.register(this);
		console.log(this);
	}
}

class CommandContext {
	bot: Bot;
	argv: Array<string>;
	target: {
		room: Array< {id:string, user_id:Array<string>} >,

		user_id: Array<string>,
	};
	event: any;

	constructor(bot: any, event:any) {
		this.bot = bot;
		this.event = event;
		this.target = {
			room: [],
			user_id: []
		}
		this.parse(event)
		this.expand_room_macros()
		this.expand_user_macros()
	}


	parse(event:any) {
	   let text:Array<string> = [];

		if (event.content.format == "org.matrix.custom.html") {
			const root = parse(event.content.formatted_body);
			for (let node of Array.from(root.childNodes)) {
				if (node.rawTagName == "a") {
					let a = node as HTMLElement;
					let url = a.getAttribute("href");
					let id = url.split("/").slice(-1)[0];
					if (id[0] == "#") this.target.room.push({id:id, user_id:[]});
					if (id[0] == "!") this.target.room.push({id:id, user_id:[]});
					if (id[0] == "@") this.target.user_id.push(id);
				}

				if (node.rawTagName == "") {
					let word = node.textContent.trim();
					text.push(word);
				}
			}
		} else {
			text.push(event.content.body);
		}

		this.argv = parse_command(text.join(" "));
		this.argv[0] = this.argv[0].slice(1);

		this.argv = this.argv.filter((word) => {
			switch (word[0]) {
				case "#":
					this.target.room.push({id:word,user_id:[]});
					return false;
				case "!":
					this.target.room.push({id:word,user_id:[]});
					return false;
				case "@":
					this.target.user_id.push(word);
					return false;
				default:
					return true;
			}
		});

		if (this.target.room.length == 0 && event) {
			this.target.room.push({id:event.room_id, user_id:[]});
		}
	}

	expand_room_macros(){
		let list:Array< {id:string, user_id:Array<string>} > = [];

		for (let macro of this.target.room) {
			switch (macro.id) {
				case "#all":
					for (let room_id in this.bot.config.rooms) {
						list.push({id: room_id, user_id:[]})
					}
					break;
				default:
					list.push(macro)
					break;
			}
		}
		this.target.room= list;
	}

	expand_user_macros(){
		for (let alias of this.target.room) {

			let room_id = this.bot.resolve_room(alias.id);
			if (!room_id) {
				console.log(`Alias ${alias} failed to resolve`);
				continue;
			}
			let map = new Map<string, boolean>; /* Used for deduplication */

			for (let macro of this.target.user_id) {
				
				let arg = macro.split("=");
				if (arg[0] === "@level") {
					let level = parseInt(arg[1])
					if (isNaN(level)) {
						// Return an error somehow?
						continue;
					}
					
					let room = this.bot.get_room(room_id);
					let ships = room.get_all_memberships();
					// TODO
					
					ships.forEach((state, user_id) => {
						if(state == "join") {
							
							let member = room.get_member(user_id);
							if (member.powerlevel() == level) {
								map.set(user_id, true);
							}
						}
					});

					continue;
					
				}

				if (macro == "@banned") {
					let room = this.bot.get_room(room_id);
					let ships = room.get_all_memberships();
					
					ships.forEach((state, user_id) => {
						if (state == "ban") 
							map.set(user_id, true);
					});
					continue;
				}

				map.set(macro, true);
			}

			/* Save to room targets */
			map.forEach((_, user_id)=>{
				alias.user_id.push(user_id);
			});
		}

	}

	async for_rooms( callback:(room_id:string)=>Promise<void> ){
		for (let alias of this.target.room) {
			let room_id = this.bot.resolve_room(alias.id);
			if (room_id) await callback(room_id)
		}
	}

	async for_users( callback:(user_id:string)=>Promise<void> ){
		for (let user_id of this.target.user_id) {
			await callback(user_id);
		}
	}

	async for_pairs( callback:(room_id:string, user_id:string)=>Promise<void> ){
		for (let alias of this.target.room) {
			let room_id = this.bot.resolve_room(alias.id);
			if (room_id) {
				for (let user_id of alias.user_id) {
					await callback(room_id, user_id)
				}
			}
		}
	}

	async reply(msg: string) {
		if (this.event) {
			await this.bot.send_mention(this.event.room_id, [this.event.sender], msg);
		} else {
			console.log(msg);
		}
	}
}

class CommandManager {
	bot:Bot;
	cmd: Map<string, Command>;

	md: string;

	constructor(bot:Bot) {
		this.bot = bot;
		this.cmd = new Map<string, Command>();
		this.md = ""

		this.md += `${"Command".padEnd(doc_col_1)}${"LVL".padEnd(6)}${"Description"}\n`

	}
	
	register(cmd:Command) {
		this.cmd.set(cmd.name, cmd)

		let lvltxt = cmd.filter.level.toString();

		this.md += `${cmd.usage.padEnd(doc_col_1)}`
		if (cmd.filter.room.any) {
			this.md += `${lvltxt.padEnd(6)}`
		} else {
			let cli_only = true 
			for (let id in cmd.filter.room) {
				if (cmd.filter.room[id] === true) cli_only = false
			}

			if (cli_only)
				this.md += `${"cli".padEnd(6)}`
			else
				this.md += `${(lvltxt+"*").padEnd(6)}`
		}
		this.md += `${cmd.description}\n`
	}

	async run(event:any) {

		let ctx = new CommandContext(this.bot, event)
		let cmd = this.cmd.get(ctx.argv[0])

		if (!cmd) {
			console.log(`No such command: ${ctx.argv[0]}`);
			return 1;
		}

		if (!event && cmd.filter.console == false) {
			console.log("This command cannot be run on the console.");
			return 1;
		}

		if (event) {
			if (cmd.filter.room[event.room_id] === false) {
				console.log("No run because room explictly denied");
				return;
			}

			if (
				cmd.filter.room[event.room_id] !== true &&
				cmd.filter.room.any == false
			) {
				console.log("Not whitelisted");
				return;
			}

			let room = this.bot.get_room(event.room_id);
			let member = room.get_member(event.sender);

			if (cmd.filter.level > member.powerlevel()) {
				console.log("Insufficient power level");
				return;
			}
		}

		try {
			await cmd.fn.bind(this.bot)(ctx);
		} catch (err) {
			ctx.reply(`An error occured:\n<pre><code>${err}</pre></code>`);
		}
	}
}

export { Command, CommandContext, CommandManager };
