import fs from "node:fs/promises";
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { parse_command } from "./parse_command.mjs";
import { Command, CommandContext } from "./command.mjs";
import { Util } from "./utils.mjs";
import { Bot, Room, Member } from "./bot.mjs";
import { Transaction } from "./database.mjs";

const rl = readline.createInterface({ input, output });

async function main() {
	await Util.sleep(1000);
	let config = JSON.parse(
		await fs.readFile("config.json", { encoding: "utf8" }),
	);

	let bot = new Bot(config);


	/*
	 _____                                           _     
	/  __ \                                         | |    
	| /  \/ ___  _ __ ___  _ __ ___   __ _ _ __   __| |___ 
	| |    / _ \| '_ ` _ \| '_ ` _ \ / _` | '_ \ / _` / __|
	| \__/\ (_) | | | | | | | | | | | (_| | | | | (_| \__ \
	 \____/\___/|_| |_| |_|_| |_| |_|\__,_|_| |_|\__,_|___/

	*/                                                      

	bot.cmd.md += "\n# General commands\n";

	let help = "";

	new Command("help", async function (this:Bot, ctx:CommandContext) {
		let body = "Usage:\n<pre><code>";
		body = help.replaceAll("<", "&lt;").replaceAll(">", "&gt;");
		await ctx.reply('<pre><code>'+body+"</pre></code>");
	})
	.set_description("Prints help.")
	.allow_any_room()
	.set_level(50)
	.register(bot.cmd);


	new Command("ping", async function (this:Bot, ctx:CommandContext) {
		await ctx.reply("Pong!");
	})
	.set_description("Pong!")
	.deny_any_room()
	.allow_room(config.alert_room)
	.allow_any_user()
	.set_level(1)
	.register(bot.cmd);
	

	/*
	___  ___          _                _   _             
	|  \/  |         | |              | | (_)            
	| .  . | ___   __| | ___ _ __ __ _| |_ _  ___  _ __  
	| |\/| |/ _ \ / _` |/ _ \ '__/ _` | __| |/ _ \| '_ \ 
	| |  | | (_) | (_| |  __/ | | (_| | |_| | (_) | | | |
	\_|  |_/\___/ \__,_|\___|_|  \__,_|\__|_|\___/|_| |_|
                                                     
	 */

	bot.cmd.md += "\n# Moderaion commands\n";

	new Command("level [#rooms..] <@users..> [number]", async function (this:Bot, ctx:CommandContext) 
	{
		let level:number = null;

		if (ctx.argv.length == 2) {
			level = parseInt(ctx.argv[1]);

			if (level === null || isNaN(level) || level > 95 || level < -50) {
				await ctx.reply("Invalid level ${level}");
				return;
			}

			for (let alias of ctx.target.room) {
				let room_id = this.resolve_room(alias.id);
				if (!room_id) continue;

				let state_event = await this.api.v3_state(room_id, "m.room.power_levels");

				for (let user_id of ctx.target.user_id) {
					state_event.users[user_id] = level;
				}

				await this.api.v3_put_state(room_id, "m.room.power_levels", state_event);	
			}
		} else {
			await ctx.for_pairs(async (room_id:string, user_id:string) => 
			{
				let member = this.get_member(room_id, user_id);
				let level = member.powerlevel();
				let body = `${this.get_alias(room_id)} ${user_id} = ${level}`;
				await ctx.reply(body);
			});
		}
	})
	.set_description("Set or get user powerlevels.")
	.set_level(90)
	.allow_any_room()
	.register(bot.cmd);


	new Command("redact [#rooms..] <@users>", async function (this:Bot, ctx:CommandContext) 
	{
		await ctx.for_pairs(async (room_id:string, user_id:string) => {
			let member = new Member(this, room_id, user_id);

			if (!member.is_member()) {
				await ctx.reply("Invalid user!");
				return;
			}

			let redact_id = member.member_event().event_id;
			await this.api.v3_redact(room_id, redact_id, "");

			await ctx.reply(`User ${user_id} redacted`);
		});
	})
	.set_description("Redacts user's avatar and displayname.")
	.set_level(50)
	.allow_any_room()
	.register(bot.cmd);

	new Command("kick [#rooms..] <@users..>", async function (this:Bot, ctx:CommandContext) 
	{
		await ctx.for_pairs(async (room_id:string, user_id:string) => 
		{
			await this.api.v3_kick(room_id, user_id, "");
		});
	})
	.set_description("Kick user from target rooms.")
	.set_level(50)
	.allow_any_room()
	.register(bot.cmd);

	new Command("mute [#rooms..] <@users>", async function (this:Bot, ctx:CommandContext) 
	{
		await ctx.for_pairs(async (room_id:string, user_id:string) => 
		{
			let member = new Member(this, room_id, user_id);
			if (member.is_member()) {
				await member.set_powerlevel(-1);
			}
		});
	})
	.set_description("Mute user in target rooms.")
	.set_level(50)
	.allow_any_room()
	.register(bot.cmd);


	new Command("ban <@users..>", async function (this:Bot, ctx:CommandContext)
	{
		await ctx.for_users(async (user_id:string)=>
		{
			let tx = new Transaction(this.db);
			do {
				let user = await tx.user(user_id);
				console.log("User");
				console.log(user);
				if (!user) {
					await ctx.reply("Invalid user!");
					await tx.abort();
					return;
				}
				user.onjoin = "ban";
			} while (await tx.retry());

			for (let room in this.config.rooms) {
				let member = new Member(this, room, user_id);
				if (member.is_member()) {
					await member.ban();
					await member.set_powerlevel(0);
				}
			}
		});
	})
	.set_description(`Ban user from all managed rooms.`)
	.set_level(50)
	.allow_any_room()
	.register(bot.cmd);

	new Command("whitelist <@users..>", async function (this:Bot, ctx:CommandContext)
	{
		await ctx.for_users(async (user_id:string)=>
		{
			let tx = new Transaction(this.db);
			do {
				let user = await tx.user(user_id);
				console.log("User");
				console.log(user);
				if (!user) {
					await ctx.reply("Invalid user!");
					await tx.abort();
					return;
				}
				user.onjoin = "whitelist";
				console.log("Retry");
				await Util.sleep(1000);
			} while (await tx.retry());

			for (let room in this.config.rooms) {
				let member = new Member(this, room, user_id);
				if (member.is_member() && member.powerlevel() <= 0) {
					await member.set_powerlevel(1);
				}
			}

		});
	})
	.set_description(`Whitelists users (sets database.onjoin to "whitelist")`)
	.set_level(50)
	.allow_any_room()
	.register(bot.cmd);

	new Command("unban <@users..>", async function (this:Bot, ctx:CommandContext)
	{
		await ctx.for_users(async (user_id:string)=>
		{
			for (let room in this.config.rooms) {
				let member = new Member(this, room, user_id);
				if (member.is_banned()) {
					await member.unban();
				}
			}
		});
	})
	.set_description(`Unban user in all managed rooms. You must run this only after !whitelist.`)
	.allow_any_room()
	.set_level(50)
	.register(bot.cmd);

	new Command("joinrule [#rooms..] <public|invite>", async function (this:Bot, ctx:CommandContext)
	{
		let rule = ctx.argv[1];
		if (rule != "public" && rule != "invite") {
			await ctx.reply(`Invalid argument ${rule}, use public or invite`);
			return;
		}
		await ctx.for_rooms(async (room_id:string)=>
		{
			const data = {
				join_rule: rule,
			};
			await this.api.v3_put_state(room_id, "m.room.join_rules", data);
		});
	})
	.set_description(`Sets room to public or invite-only.`)
	.set_level(50)
	.allow_any_room()
	.register(bot.cmd);


	/*
	  ___  _____  _     
	 / _ \/  __ \| |    
	/ /_\ \ /  \/| |    
	|  _  | |    | |    
	| | | | \__/\| |____
	\_| |_/\____/\_____/

	Server Access Control List
	*/

	bot.cmd.md += "\n# ACL commands\n";

	// TODO store ACL in database?
	new Command("acl <homeserver>", async function (this:Bot, ctx:CommandContext)
	{
		if (!ctx.argv[1]) {
			await ctx.reply("Homeserver required");
			return;
		}

		let acl = JSON.parse(await fs.readFile("acl.json", "utf8"));

		acl.deny.push(ctx.argv[1]);

		await fs.writeFile("acl.json", JSON.stringify(acl, null, 4));
		await ctx.reply(`${ctx.argv[1]} added to ACL`);
	})
	.set_description(`Write homeserver to deny field of acl.json`)
	.allow_any_room()
	.register(bot.cmd);


	new Command("acl.reload", async function (this:Bot, _:CommandContext)
	{
		let data = JSON.parse(await fs.readFile("acl.json", "utf8"));
		for (let room_id in this.config.rooms) {
			if (!this.config.rooms[room_id].manage) {
				continue;
			}
			await this.api.v3_put_state(room_id, "m.room.server_acl", data);
		}
	})
	.set_description(`Load acl.json to all managed rooms.`)
	.allow_any_room()
	.register(bot.cmd);

	/*
	  _____       _                    _____ __  __ _____      
	 |  __ \     | |                  / ____|  \/  |  __ \     
	 | |  | | ___| |__  _   _  __ _  | |    | \  / | |  | |___ 
	 | |  | |/ _ \ '_ \| | | |/ _` | | |    | |\/| | |  | / __|
	 | |__| |  __/ |_) | |_| | (_| | | |____| |  | | |__| \__ \
	 |_____/ \___|_.__/ \__,_|\__, |  \_____|_|  |_|_____/|___/
							   __/ |                           
							  |___/                            
	*/
	bot.cmd.md += "\n# Debug commands\n";

	new Command("db.forget_user <@users..>", async function (this:Bot, ctx:CommandContext) {
		await ctx.for_users(async (user_id:string)=>{
			let user = await this.db.get_user(user_id);
			if (!user) {
				await ctx.reply(`Invalid user ${user_id}`);
			}
			user = { _id: user._id };
			await this.db.put_user(user);
			await ctx.reply(`Dropped ${user_id}`);
		});
	})
	.set_description("(DEBUG ONLY) Drops user from database.")
	.set_level(100)
	.allow_any_room()
	.register(bot.cmd);

	new Command("db.get_user <@users..> [field]", async function (this:Bot, ctx:CommandContext) {
		let field = ctx.argv[1];
		await ctx.for_users(async (user_id:string)=>{
			let user = await this.db.get_user(user_id);
			if (!user) {
				await ctx.reply(`Invalid user ${user_id}`);
			}
			if (field) {
				await ctx.reply("<pre></code>"+JSON.stringify(user[field], null, 4)+"</pre></code>");
			} else {
				await ctx.reply("<pre></code>"+JSON.stringify(user, null, 4)+"</pre></code>");
			}
		});
	})
	.set_description("(DEBUG ONLY) Print user's database document, or a specific field of it.")
	.set_level(90)
	.allow_any_room()
	.register(bot.cmd);

	new Command("testctx [#rooms..] [@users..] [args..]", async function (this:Bot, ctx:CommandContext) {
		let context = {
			target: ctx.target,
			argv: ctx.argv,
			event:ctx.event,
		};
		await ctx.reply("\n<pre><code>" + JSON.stringify(context, null, 4)+"</pre></code>");
	})
	.set_description("(DEBUG ONLY) Prints internal command context.")
	.allow_any_room()
	.register(bot.cmd);

	new Command("throw", async function (_:CommandContext) {
		throw "Test error";
	})
	.set_level(100)
	.set_description("(DEBUG ONLY) Throw an error.")
	.allow_any_room()
	.register(bot.cmd);

	new Command("cli-only", async function (_:CommandContext) {
	})
	.set_description("(DEBUG ONLY) NO-OP")
	.register(bot.cmd);

	new Command("eval <code>", async function (ctx:CommandContext) {
		try {
			eval(ctx.argv[1]);
		} catch (e) {
			await ctx.reply(`${e}`);
		}
	})
	.set_level(100)
	.set_description("(DEBUG ONLY) Evaluate JavaScript code.")
	.allow_any_room()
	.register(bot.cmd);


	/*
	______                                      _        _   _             
	|  _  \                                    | |      | | (_)            
	| | | |___   ___ _   _ _ __ ___   ___ _ __ | |_ __ _| |_ _  ___  _ __  
	| | | / _ \ / __| | | | '_ ` _ \ / _ \ '_ \| __/ _` | __| |/ _ \| '_ \ 
	| |/ / (_) | (__| |_| | | | | | |  __/ | | | || (_| | |_| | (_) | | | |
	|___/ \___/ \___|\__,_|_| |_| |_|\___|_| |_|\__\__,_|\__|_|\___/|_| |_|
																		   
	*/

   bot.cmd.md += "\n* Available only in specific rooms";
	help = bot.cmd.md;
	bot.cmd.md = "\n\n```md\n" + bot.cmd.md;


	bot.cmd.md += "\n```\n";
	bot.cmd.md +=
`
## Command targets

Commands can often take multiple rooms and users, and perform actions in bulk. For example: 
'''
!kick #alpha #bravo @foo @bar
'''
This will kick all the listed '@users' from all the listed '#rooms'.

The order at which rooms, users, or even arguments are listed, do not generally matter.

'''!level @foo #bravo 1''' is equal to '''!level #bravo 1 @foo'''. Both will set the power level of '@foo' in room '#bravo' to '1'.

If room is optional but none is specified, the action is performed on the room 
where the command was issued. Same is true with users, commands with optional 
user targets will run on the user issuing the command, if none was given.

Note: the ':domain.org' is omitted from IDs in these examples, but is required in practice.

## Macros
Currently implemented macros: 
* '#all' Expands to all managed rooms
* '@banned' Expands to all banned users in a room
* '@level=<number>' Expands to all users at a specific power level in a room

Commands for user macros will be ran only in the rooms where the condition is 
true.

## Editing this file
This file is generated from 'main.mts' and 'command.mts', when the bot is ran 
using "MAKE_DOCS=1" environment variable. Do not edit this file directly. 
`.replaceAll("'", "`");

	if (process.env.MAKE_DOCS == "1") {
		console.log("Generate docs");
		await fs.writeFile("docs/commands.md", bot.cmd.md);
		process.exit(0);
	}

	/*
	 _____ _             _              _                   
	/  ___| |           | |     ___    | |                  
	\ `--.| |_ __ _ _ __| |_   ( _ )   | | ___   ___  _ __  
	 `--. \ __/ _` | '__| __|  / _ \/\ | |/ _ \ / _ \| '_ \ 
	/\__/ / || (_| | |  | |_  | (_>  < | | (_) | (_) | |_) |
	\____/ \__\__,_|_|   \__|  \___/\/ |_|\___/ \___/| .__/ 
													 | |    
													 |_|    
	*/

	await bot.init();
	//await bot.build_user_db()
	await bot.sync();

	while (!bot.exit) {
		const ret = await rl.question("/");

		let argv = parse_command(ret);
		console.log(argv);
		console.log("Executing commands on console disabled for now");
		//bot.run_command(argv, null);
	}
}

await main();



/*

 _____ ___________ _____ 
|_   _|  _  |  _  \  _  |
  | | | | | | | | | | | |
  | | | | | | | | | | | |
  | | \ \_/ / |/ /\ \_/ /
  \_/  \___/|___/  \___/ 
                         
                         



	new Command("mute", async function (ctx) {
		let user_id = ctx.argv[1];
		let user = await this.db.get_user(user_id);
		if (!user) {
			ctx.reply("Invalid user!");
			return;
		}
		user.onjoin = "mute";
		await this.db.put_user(user);
		for (let room in this.config.rooms) {
			let member = new Member(this, room, user_id);
			if (member.is_member()) {
				await member.set_powerlevel(-1);
			}
		}
	})
	.allow_console()
	.allow_any_room()
	.register(bot);



	new Command("alljoins", async function (ctx) {
		let room_id = ctx.event?.room_id;
		//let room = this.get_room(room_id)

		let query = { room_id: room_id, type: "m.room.member" };
		let ret = await this.db.events.find(query).toArray();
		let users = {};
		for (let e of ret) {
			if (!users[e.state_key]) {
				users[e.state_key] = e;
				continue;
			}
			if (e.origin_server_ts > users[e.state_key].origin_server_ts) {
				users[e.state_key] = e;
			}
		}

		fs.writeFile("dump.json", JSON.stringify(users, null, 4));
	})
	.allow_any_room()
	.register(bot);

	new Command("atlevel", async function (ctx) {
		let room_id = ctx.event?.room_id;
		let room = this.get_room(room_id);
		let level = parseInt(ctx.argv[1]);

		let action = ctx.argv[2];

		if (level === null || isNaN(level)) {
			console.log("Invalid level ${level}");
			return;
		}

		let now = new Date().getTime();

		let list = [];
		let count = 0;

		let query = { room_id: room_id, type: "m.room.member" };
		let ret = await this.db.events.find(query).toArray();
		let users = {};
		for (let e of ret) {
			if (!users[e.state_key]) {
				users[e.state_key] = e;
				continue;
			}
			if (e.origin_server_ts > users[e.state_key].origin_server_ts) {
				users[e.state_key] = e;
			}
		}

		let dump = [];

		for (let user_id in users) {
			count++;
			let member = room.get_member(user_id);

			let state = users[user_id];
			if (
				state.content.membership == "join" &&
				member.powerlevel() == level
			) {
				let fake_event = {
					origin_server_ts: state.origin_server_ts,
					sender: state.state_key,
					room_id: state.room_id,
				};
				let dbuser = await this.get_user_by_event(fake_event);

				list.push(dbuser);
			}
		}

		list.sort((a, b) => {
			return b.first_seen - a.first_seen;
		});

		let dumptxt = `Users at level ${level}\n`;
		for (let i in list) {
			let user = list[i];

			let since = Util.format_time(
				now - new Date(user.first_seen).getTime(),
			);
			let line = `${user._id.slice(1).padEnd(50)} ${since.padEnd(10)}`;
			console.log(line);
			dump.push(user._id);
			dumptxt += line + "\n";
		}

		await fs.writeFile("dump.json", JSON.stringify(dump, null, 4));
		await fs.writeFile("dump.txt", dumptxt);

		if (action == "kick") {
			for (let user_id of dump) {
				if (this.rooms[room_id].member[user_id]) {
					console.log(`Kick ${user_id}`);
					await this.api.v3_kick(room_id, user_id);
				}
			}
		} else if (action == "ban") {
			for (let user_id of dump) {
				console.log(`Ban ${user_id}`);
				await this.api.v3_ban(room_id, user_id);
				await Util.sleep(3000);
			}
		} else {
			if (ctx.event) ctx.reply(dumptxt);
		}

		console.log(count, action);
	})
	.allow_any_room()
	.register(bot);

	new Command("export", async function (ctx) {
		let users = await this.db.users
			.find({ onjoin: { $ne: null } })
			.toArray();
		if (!users) {
			console.log("Users undefined");
		}
		let file = {};
		users.forEach((user) => {
			file[user._id] = { onjoin: user.onjoin };
		});
		let data = JSON.stringify(file, null, 4);
		console.log(data);
		await fs.writeFile("export.json", data);
	})
	.allow_console()
	.register(bot);

	new Command("import", async function (ctx) {
		let data = JSON.parse(await fs.readFile("export.json", "utf8"));
		console.log(data);
		for (let key in data) {
			let user = data[key];
			console.log(key, user);

			let dbuser = await this.db.get_user(key);
			if (!user) {
				ctx.reply("Invalid user!");
				return;
			}
			dbuser.onjoin = user.onjoin;
			await this.db.put_user(dbuser);
		}
	})
	.allow_console()
	.register(bot);

	// TODO store ACL in database?
	new Command("acl", async function (ctx) {
		if (!ctx.argv[1]) {
			ctx.reply("Server needed");
			return;
		}

		let acl = JSON.parse(await fs.readFile("acl.json", "utf8"));

		acl.deny.push(ctx.argv[1]);

		await fs.writeFile("acl.json", JSON.stringify(acl, null, 4));
		ctx.reply(`${ctx.argv[1]} added to ACL`);
	})
	.allow_console()
	.allow_any_room()
	.register(bot);

	new Command("acl.fromdump", async function (ctx) {
		let acl = JSON.parse(await fs.readFile("acl.json", "utf8"));
		let raid = JSON.parse(await fs.readFile("dump.json", "utf8"));

		let hs = {};

		for (let user_id of raid) {
			hs[user_id.split(":")[1]] = true;
		}

		for (let domain of acl.deny) {
			hs[domain] = true;
		}

		delete acl.deny;
		acl.deny = [];

		for (let domain in hs) {
			acl.deny.push(domain);
		}

		let txt = JSON.stringify(acl, null, 4);
		console.log(txt);
		await fs.writeFile("acl.json", txt);
	})
	.allow_console()
	.allow_any_room()
	.register(bot);

	new Command("acl.reload", async function (ctx) {
		let data = JSON.parse(await fs.readFile("acl.json", "utf8"));

		for (let room_id in this.config.rooms) {
			if (!this.config.rooms[room_id].manage) {
				continue;
			}
			await this.api.v3_put_state(room_id, "m.room.server_acl", data);
		}
	})
	.allow_console()
	.allow_any_room()
	.register(bot);

	new Command("joinrule", async function (ctx) {
		let room_id = ctx.event.room_id;
		let rule = ctx.argv[1];
		if (rule != "public" && rule != "invite") {
			ctx.reply(`Invalid argument ${rule}, use public or invite`);
			return;


		}

		const data = {
			join_rule: rule,
		};
		await this.api.v3_put_state(room_id, "m.room.join_rules", data);
	})
	.allow_console()
	.allow_any_room()
	.register(bot);
	*/




	/*
	new Command("userdb.rebuild", async function (ctx) {
		this.build_user_db();
	})
	.allow_console()
	.register(bot);
	/
	new Command("level.set", async function (ctx) {
		let room_id = ctx.event.room_id;
		let user_id = ctx.argv[1];
		let level = parseInt(ctx.argv[2]);

		if (level === null || isNaN(level) || level > 50 || level < -50) {
			console.log("Invalid level ${level}");
			return;
		}

		let levels = await this.api.v3_state(room_id, "m.room.power_levels");

		if (!levels) {
			console.log("Error");
			return;
		}

		levels.users[user_id] = level;

		await this.api.v3_put_state(room_id, "m.room.power_levels", levels);
	})
	.deny_console()
	.allow_any_room()
	.register(bot);

	new Command("level.setall", async function (ctx) {
		let user_id = ctx.argv[1];
		let level = parseInt(ctx.argv[2]);

		if (level === null || isNaN(level) || level > 50 || level < -50) {
			console.log("Invalid level ${level}");
			return;
		}

		console.log("Level!");

		for (let room in this.config.rooms) {
			let member = new Member(this, room, user_id);
			await member.set_powerlevel(level);
		}
	})
	.allow_console()
	.allow_any_room()
	.register(bot);

	new Command("trust.get", async function (ctx) {
		let user_id = ctx.argv[1];
		if (!user_id) {
			if (!ctx.event) {
				ctx.reply("No user!");
				return;
			}

			user_id = ctx.event.sender;
		}

		let user = await this.db.get_user(user_id);
		if (!user) {
			ctx.reply("Invalid user!");
			return;
		}
		this.calc_trust(user);

		ctx.reply(user.trust);
	})
	.allow_console()
	.allow_any_room()
	.set_level(1)
	.register(bot);
	*/



	/*
	new Command("trust.top", async function (ctx) {
		console.log("Calculating activity ...");
		let users = await this.db.all_users();
		let now = new Date().getTime();

		let fusers = [];

		users.forEach((user) => {
			this.calc_trust(user);
		});

		users.sort((a, b) => {
			return b.trust - a.trust;
		});

		for (let user of users) {
			let since = Util.format_time(
				now - new Date(user.first_seen).getTime(),
			);
			console.log(
				`${user._id.padEnd(50)} ${user.trust.toFixed(1).padEnd(10)}  ${since.padEnd(10)} ${user.msg}`,
			);
		}
	})
	.allow_console()
	.register(bot);

	new Command("activity.top", async function (ctx) {
		console.log("Calculating activity ...");
		let users = await this.db.all_users();

		let room_id = ctx.room_id;
		let now = new Date().getTime();

		let fusers = [];

		users.forEach((user) => {
			let event_count = 0;

			if (!user.rooms[room_id]) return;

			for (let event in user.rooms[room_id].events)
				event_count += user.rooms[room_id].events[event];

			let days =
				(now - new Date(user.first_seen).getTime()) /
				1000 /
				60 /
				60 /
				24;

			let epd = event_count / days;
			user.epd = epd;
			user.days = days;
			fusers.push(user);
		});

		users = fusers;

		users.sort((a, b) => {
			return b.epd - a.epd;
		});

		for (let user of users) {
			console.log(
				`${user._id.padEnd(50)} ${user.epd.toFixed(1).padEnd(5)} e/d  ${Math.floor(user.days)} d`,
			);
		}
	})
	.deny_console()
	.allow_any_room()
	.register(bot);

	new Command("trust.calc", async function (ctx) {
		let users = await this.db.all_users();

		let now = new Date().getTime();

		for (let user of users) {
			let since = Util.format_time(
				now - new Date(user.first_seen).getTime(),
			);

			console.log(`${user._id.padEnd(50)} ${since}`);
		}
	})
	.allow_console()
	.register(bot);

*/
