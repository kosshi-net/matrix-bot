import { Bot } from "./bot.mjs";
import { parse_command } from "./parse_command.mjs";
import { parse, TextNode, HTMLElement } from "node-html-parser";


class Command {
	ready_on: number;
	name: string;
	usage: string;
	fn: Function;
	filter: any;
	description: string;

	constructor(usage: string, fn: Function) {
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
		room_id: Array<string>,
		user_id: Array<string>
	};
	event: any;

	constructor(bot: any, event:any) {
		this.bot = bot;
		this.event = event;
		this.target = {
			room_id: [],
			user_id: []
		}
		this.parse(event)
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
					if (id[0] == "#") this.target.room_id.push(id);
					if (id[0] == "!") this.target.room_id.push(id);
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
					this.target.room_id.push(word);
					return false;
				case "!":
					this.target.room_id.push(word);
					return false;
				case "@":
					this.target.user_id.push(word);
					return false;
				default:
					return true;
			}
		});

		if (this.target.room_id.length == 0 && event) {
			this.target.room_id.push(event.room_id);
		}

	}

	async for_rooms( callback:(room_id:string)=>Promise<void> ){
		for (let room_alias of this.target.room_id) {
			let room_id = this.bot.resolve_room(room_alias);
			if (room_id) await callback(room_id)
		}
	}

	async for_users( callback:(user_id:string)=>Promise<void> ){
		for (let user_id of this.target.user_id) {
			await callback(user_id);
		}
	}

	async for_pairs( callback:(room_id:string, user_id:string)=>Promise<void> ){
		for (let room_alias of this.target.room_id) {
			let room_id = this.bot.resolve_room(room_alias);
			if (room_id) {
				for (let user_id of this.target.user_id) {
					callback(room_id, user_id)
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

	constructor(bot:Bot) {
		this.bot = bot;
		this.cmd = new Map<string, Command>()
	}
	
	register(cmd:Command) {
		this.cmd.set(cmd.name, cmd)
	}

	run(event:any) {

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


		cmd.fn.bind(this.bot)(ctx);
	}



}

export { Command, CommandContext, CommandManager };
