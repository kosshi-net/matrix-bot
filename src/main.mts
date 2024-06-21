import fs from "node:fs/promises";
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { Command, CommandContext } from "./command.mjs";
import { Util } from "./utils.mjs";
import { Bot, Room, Member } from "./bot.mjs";
import { Transaction } from "./database.mjs";

import {config} from "../config/config.mjs";

const rl = readline.createInterface({ input, output });

async function main() {
	await Util.sleep(1000);

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
	

	new Command("activity [#rooms..] [@users..] [tz:number]", async function (this:Bot, ctx:CommandContext) {
		let timezone = 0;
		
		if (ctx.argv[1]) {
			timezone = parseInt(ctx.argv[1]);
		}
		console.log("Timezone:", timezone);
		if (!Number.isInteger(timezone)) {
			await ctx.reply("Invalid timezone. Usage: !activity #example:matrix.org @example:matrix.org +2");
			return;
		}

		let res = [
			"▏",
			"▎",
			"▍",
			"▌",
			"▋",
			"▊",
			"▉",
			"█",
		];

		if (ctx.event) {
			/* Unicode blocks render poorly in a browser, use a pipe instead */
			res = [
				"|"
			];
		}

		let days = [
			"Mon",
			"Tue",
			"Wed",
			"Thu",
			"Fri",
			"Sat",
			"Sun"
		];

		let bar_length = 16;

		let activity_hour = new Int32Array(24);
		let activity_day = new Int32Array(7);
		let total = 0;
		await ctx.for_pairs(async (room_id:RoomID, user_id:UserID) => {
			
			let query = { room_id: room_id, sender: user_id };
			let events = await this.db.events.find(query).toArray();
			total += events.length;
			
			for (let e of events) {
				
				let date = new Date(e.origin_server_ts + (1000*60*60*timezone));
				//let h = (date.getUTCHours() + timezone + 24) % 24;
				let h = (date.getUTCHours());
				activity_hour[h]++;

				let d = (date.getUTCDay());
				activity_day[d]++;

			}

		});
		let output = "<pre><code>\n";
		let sign = timezone < 0 ? "" : "+";
		output += `Timezone: GMT${sign}${timezone}\n`;
		output += `Total events sent: ${total}\n`;
	
		let hmax = 0;
		for (let h = 0; h < 24; h++) {
			hmax = Math.max(activity_hour[h], hmax);
		}

		let dmax = 0;
		for (let h = 0; h < 7; h++) {
			dmax = Math.max(activity_day[h], dmax);
		}
	
		let graph_week = [];
		for (let d = 0; d < 7; d++) {
			let norm = activity_day[d] / dmax * bar_length;
			let bar = "";
			for (let i = 0; i < norm; i++) {
				bar += res[res.length-1];
			}
			let dec = Math.floor((norm % 1) * res.length);
			bar += res[dec];
			bar = bar.padEnd(bar_length+1, " ");
			let count = activity_day[d].toString().padStart(5, " ");
			graph_week.push(`${days[d]} ${bar} - ${count}`);
		}

		for (let h = 0; h < 24; h++) {
			let norm = activity_hour[h] / hmax * bar_length;
			let bar = "";
			for (let i = 0; i < norm; i++) {
				bar += res[res.length-1];
			}
			let dec = Math.floor((norm % 1) * res.length);
			bar += res[dec];
			bar = bar.padEnd(bar_length+1, " ");
			let count = activity_hour[h].toString().padStart(5, " ");
			output += `${(h).toString().padStart(2,'0')}:00 ${bar} - ${count}`;
			if (h < graph_week.length) {
				output += "  " + graph_week[h];
			}
			output += "\n";
		}
		output += "</code></pre>\n";


		await ctx.reply(output);
	})
	.set_description("Activity statistics and graphs")
	.set_level(50)
	.allow_any_room()
	.register(bot.cmd);

	new Command("react [emoji]", async function (this:Bot, ctx:CommandContext) {
		let key = ctx.argv[1];
		if (!key) key = "?";
		await this.react(ctx.event, key);
	})
	.set_description("Replies with a reaction.")
	.allow_any_room()
	.set_level(50)
	.register(bot.cmd);

	new Command("send <#rooms> <msg>", async function (this:Bot, ctx:CommandContext) {
		await ctx.for_rooms(async (room_id:RoomID) => {
			
			let content = {
				body: ctx.argv[1],
				msgtype: "m.text",
			};

			await this.api.v3_send(room_id, "m.room.message", content);

		});
	})
	.set_description("Make the bot send a message.")
	.allow_any_room()
	.set_level(100)
	.register(bot.cmd);

	/*     _   _           _     
		  | | | |         | |    
	 _ __ | |_| | __ _ ___| |__  
	| '_ \|  _  |/ _` / __| '_ \ 
	| |_) | | | | (_| \__ \ | | |
	| .__/\_| |_/\__,_|___/_| |_|
	| |                          
	|_|                          
	*/
	bot.cmd.md += "\n# pHash commands\n";

	new Command("phash", async function (this:Bot, ctx:CommandContext) {
		
		let target_id = ctx.event.content["m.relates_to"]?.["m.in_reply_to"]?.event_id;

		if (!target_id) {
			await ctx.reply("No reply event id found");
			return;
		}

		let e = await this.db.get_event(ctx.event.room_id, target_id);

		if (!e) {
			await ctx.reply("Failed to find quoted event.");
			return;
		}

		if (e.content?.msgtype != "m.image") {
			await ctx.reply("Quoted event has no image.");
			return;
		}

		let mime = e.content?.info?.mimetype;
		switch (mime) {
		case "image/jpeg":
		case "image/png":
			break;
		default:
			await ctx.reply(`Unsupported content-type (${mime})`);
			return;
		}

		let hash = await this.phash.hash(e.content.url);

		let arr = await this.phash.get_matches(hash);
		
		let e_list = await this.db.events.find( {"content.url": {$in: arr}}).toArray();

		let out = `<code>${hash}</code>\n`;
		for (let e of e_list) {
			out += `https://matrix.to/#/${e.room_id}/${e.event_id}\n`;
		}
		out += "";

		await ctx.reply(out);
	})
	.set_description("Return the hash and reposts of the quoted image.")
	.allow_any_room()
	.set_level(50)
	.register(bot.cmd);


	new Command("phash.import <file>", async function (ctx) {
		let data = JSON.parse(await fs.readFile(ctx.argv[1], "utf8"));
		console.log(data);
		let list = [];
		let up = 0;
		for (let obj of data) {

			let doc = {
				_id:   obj.mxc,
				phash: obj.phash,
			};
			
			let op = {
				updateOne: {
					filter: {_id: doc._id},
					update: doc,
					upsert: true,
				}
			};
	
			const query = { _id: doc._id };
			const ret = await this.db.phash.updateOne(
				query,
				{ $set: doc },
				{ upsert: true },
			);
			up += ret.upsertedCount;

			list.push(op);
		}
		await ctx.reply(`Inserted ${list.length} items (${up} upserts).`);
	})
	.set_description("Import image hashes from a file")
	.set_level(100)
	.allow_any_room()
	.register(bot.cmd);


	new Command("phash.scan", async function (ctx) {
		
		let e_list = [];
		await ctx.for_rooms(async (room_id:RoomID)=>{
			let query = {
				"content.msgtype":"m.image", 
				"room_id": room_id
			};

			let arr = await this.db.events.find(query).toArray();
			e_list = e_list.concat(arr);
		});

		let mxc_list = await this.db.phash.distinct("_id");
	
		console.log(mxc_list);

		await ctx.reply(`Total events ${e_list.length}`);

		e_list = e_list.filter( (e)=>{ 
			for (let mxc of mxc_list) {
				if (e.content.url == mxc) return false;
			}
			return true;
		});
	
		await ctx.reply(`Events missing phash: ${e_list.length}`);

		for (let e of e_list) {
			await this.phash.check(e, false);
		}
	})
	.set_description("Find and hash unhashed image events.")
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
			
			if (ctx.event) {
				let sender_member:Member = this.get_member(ctx.event.room_id, ctx.event.sender);
				let sender_level = sender_member.powerlevel();
				if (sender_level < 90 && level > 10) {
					await ctx.reply("Moderators cannot promote users above level 10");
					return;
				}
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
			await ctx.for_pairs(async (room_id:RoomID, user_id:UserID) => 
			{
				let member = this.get_member(room_id, user_id);
				let level = member.powerlevel();
				let body = `${this.get_alias(room_id)} ${user_id} = ${level}`;
				await ctx.reply(body);
			});
		}
	})
	.set_description("Set or get user powerlevels.")
	.set_level(50)
	.allow_any_room()
	.register(bot.cmd);


	new Command("redact [#rooms..] <@users>", async function (this:Bot, ctx:CommandContext) 
	{
		await ctx.for_pairs(async (room_id:RoomID, user_id:UserID) => {
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
		await ctx.for_pairs(async (room_id:RoomID, user_id:UserID) => 
		{
			await this.api.v3_kick(room_id, user_id, "");
		});
	})
	.set_description("Kick user from target rooms.")
	.set_level(50)
	.allow_any_room()
	.register(bot.cmd);


	new Command("mute [#rooms..] <@users> [timeout]", async function (this:Bot, ctx:CommandContext) 
	{
		let ts = 0;
		if (ctx.argv[1]) {
			ts = Util.parse_time(ctx.argv[1]);
		}

		await ctx.for_pairs(async (room_id:RoomID, user_id:UserID) => 
		{
			let member = new Member(this, room_id, user_id);
			if (member.is_member()) {
				await member.set_powerlevel(-1);

				if (ts == 0) return;
				
				this.sched.once(`level ${room_id} ${user_id} 1`, ts);
			}
		});
	})
	.set_description("Mute user in target rooms.")
	.set_level(50)
	.allow_any_room()
	.register(bot.cmd);


	new Command("ban <@users..> [timeout]", async function (this:Bot, ctx:CommandContext)
	{
		let ts = 0;
		if (ctx.argv[1]) {
			ts = Util.parse_time(ctx.argv[1]);
		}

		await ctx.for_users(async (user_id:UserID)=>
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

			let room_id:RoomID;
			for (room_id in this.config.rooms) {
				let member = new Member(this, room_id, user_id);
				if (member.is_member()) {
					await member.ban();
					await member.set_powerlevel(0);
				}
			}

			if (ts) {
				this.sched.once(`unban ${user_id}`, ts);
			}

		});
	})
	.set_description(`Ban user from all managed rooms.`)
	.set_level(50)
	.allow_any_room()
	.register(bot.cmd);


	new Command("unban <@users..>", async function (this:Bot, ctx:CommandContext)
	{
		await ctx.for_users(async (user_id:UserID)=>
		{
			let tx = new Transaction(this.db);
			do {
				let user = await tx.user(user_id);
				if (!user) {
					await ctx.reply("Invalid user!");
					await tx.abort();
					return;
				}
				user.onjoin = "whitelist";
			} while (await tx.retry());
			
			let room_id:RoomID;
			for (room_id in this.config.rooms) {
				let member = new Member(this, room_id, user_id);
				if (member.is_member() && member.powerlevel() <= 0) {
					await member.set_powerlevel(1);
				}
				if (member.is_banned()) {
					await member.unban();
				}
			}
			
		});
	})
	.set_description(`Unban user in all managed rooms.`)
	.allow_any_room()
	.set_level(50)
	.register(bot.cmd);


	new Command("whitelist <@users..>", async function (this:Bot, ctx:CommandContext)
	{
		await ctx.for_users(async (user_id:UserID)=>
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
				await Util.sleep(1000);
			} while (await tx.retry());

			for (let room in this.config.rooms) {
				/* TODO Fix dirty cast!!! */
				let member = new Member(this, room as RoomID, user_id);
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




	new Command("joinrule [#rooms..] <public|invite>", async function (this:Bot, ctx:CommandContext)
	{
		let rule = ctx.argv[1];
		if (rule != "public" && rule != "invite") {
			await ctx.reply(`Invalid argument ${rule}, use public or invite`);
			return;
		}
		await ctx.for_rooms(async (room_id:RoomID)=>
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
	 _____      _              _       _      
	/  ___|    | |            | |     | |     
	\ `--.  ___| |__   ___  __| |_   _| | ___ 
	 `--. \/ __| '_ \ / _ \/ _` | | | | |/ _ \
	/\__/ / (__| | | |  __/ (_| | |_| | |  __/
	\____/ \___|_| |_|\___|\__,_|\__,_|_|\___|

	*/                                    
	bot.cmd.md += "\n# Scheduling commands\n";

	new Command("sched.once <command> <timeout>", async function (this:Bot, ctx:CommandContext) {
		let ts  = Util.parse_time(ctx.argv[2]);
		let cmd = ctx.argv[1];
		if (!cmd) throw "No command to schedule";
		let doc = await this.sched.once(cmd, ts);
		await ctx.reply(`Command <code>${cmd}</code> scheduled for ${Util.format_date(doc.ts_next)}`);
	})
	.set_description("Schedule a command.")
	/* WARNING! Priviledge escalation if you set this below 100 */
	.set_level(100) 
	.allow_any_room()
	.register(bot.cmd);


	new Command("sched.list", async function (this:Bot, ctx:CommandContext) {
		let list = await this.db.schedule.find().toArray();

		let ts_now = new Date().getTime();
		
		let out = "<pre><code>\n";

		for (let item of list) {
			let str = `At ${Util.format_date(item.ts_next)}, in ${Util.format_time(item.ts_next-ts_now)}`;
			out += `${str}\n${item.cmd}\n\n`;
		}

		out += "</code></pre>";

		await ctx.reply(out);
	})
	.set_description("List schedule.")
	.allow_any_room()
	.set_level(50)
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
			/* TODO fix dirty cast!! */
			await this.api.v3_put_state(room_id as RoomID, "m.room.server_acl", data);
		}
	})
	.set_description(`Load acl.json to all managed rooms.`)
	.allow_any_room()
	.register(bot.cmd);

	/*
	______      _        _                    
	|  _  \    | |      | |                   
	| | | |__ _| |_ __ _| |__   __ _ ___  ___ 
	| | | / _` | __/ _` | '_ \ / _` / __|/ _ \
	| |/ / (_| | || (_| | |_) | (_| \__ \  __/
	|___/ \__,_|\__\__,_|_.__/ \__,_|___/\___|
	*/

	bot.cmd.md += "\n# Database queries\n";

	new Command("db.query <collection> <query>", async function (this:Bot, ctx:CommandContext) {

		let arg_col = ctx.argv[1];
		let arg_query = JSON.parse(ctx.argv[2]);
		
		if (!this.db[arg_col]) {
			await ctx.reply("No such collection");
			return;
		}
		
		let arr = await this.db[arg_col].find(arg_query).toArray();

		await ctx.reply(
			"<pre><code>" +
			JSON.stringify(arr, null, 4)+
			"</pre></code>"
		);

	})
	.set_description("Query database")
	.set_level(90)
	.allow_any_room()
	.register(bot.cmd);
	

	new Command("db.get_user <@users..> [field]", async function (this:Bot, ctx:CommandContext) {
		let field = ctx.argv[1];
		await ctx.for_users(async (user_id:UserID)=>{
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
	.set_description("Print user's database document, or a specific field of it.")
	.set_level(90)
	.allow_any_room()
	.register(bot.cmd);


	new Command("db.dump_mxc [#rooms..] <filename.json>", async function (this:Bot, ctx:CommandContext) {
		let filename = ctx.argv[1];
		let out = [];
		if (!filename) {
			await ctx.reply("No filename");
			return;
		}
		await ctx.for_rooms(async (room_id:RoomID)=>{
			let query = {
				"content.msgtype":"m.image", 
				"room_id": room_id
			};

			let arr = await this.db.events.find(query).toArray();
			out = out.concat(arr);
		});
		await fs.writeFile(filename, JSON.stringify(out, null, 4));
		await ctx.reply(`Saved ${out.length} events to ${filename}`);
	})
	.set_description("Save all m.image events to a file")
	.set_level(100)
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
		await ctx.for_users(async (user_id:UserID)=>{
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


	new Command("parse_time <timeout>", async function (this:Bot, ctx:CommandContext) {
		let ts = Util.parse_time(ctx.argv[1]);
		await ctx.reply(ts.toString());
	})
	.set_description("(DEBUG ONLY) Test time parsing")
	.set_level(100)
	.allow_any_room()
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

## Timeouts
Examples: '2day6hour10min30sec', '1min30sec', '30d'

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
	void bot.sync();

	while (!bot.exit) {
		const ret = await rl.question("/");
		console.log(`cmd: ${ret}`);
		await bot.cmd.run(null, `!${ret}`);
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


*/
