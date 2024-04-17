// @ts-check
"use strict";
import fs from 'node:fs/promises'
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import {parse_command} from "./parse_command.mjs"
import {Command} from "./command.mjs"
import {Util} from "./utils.mjs"
import {Bot, Room, Member} from "./bot.mjs"
import {Transaction} from "./database.mjs"


const rl = readline.createInterface({ input, output });

async function main() {
	await Util.sleep(1000)
	let config = JSON.parse( await fs.readFile("config.json",{encoding:'utf8'}))

	let bot = new Bot(config)


	new Command("ping", async function(ctx) {
		ctx.reply("Pong!")
	})
	.allow_console()
	.deny_any_room()
	.allow_room(config.alert_room)
	.allow_any_user()
	.set_level(1)
	.register(bot)


	new Command("lsrooms", async function(ctx) {
		for (let room_id in this.rooms) {
			console.log(room_id)
			let room = this.get_room(room_id)
			console.log(this.rooms[room_id].state)
		}
	})
	.allow_console()
	.register(bot)


	new Command("level.get", async function(ctx) {
		let room_id = ctx.event.room_id
		let user_id = ctx.argv[1]
		let member = this.get_member(room_id, user_id)

		let level = member.powerlevel()

		let content = {
			body: `Power level of ${ctx.argv[1]} is ${level}`,
			msgtype: "m.notice"
		}
		await this.api.v3_send(room_id, "m.room.message", content)
	})
	.allow_console()
	.allow_any_room()
	.register(bot)


	new Command("help", async function(ctx) {
		for ( let cmd in this.commands ) {
			console.log(cmd)
		}
	})
	.allow_console()
	.register(bot)

	
	new Command("userdb.rebuild", async function(ctx) {
		this.build_user_db();
	})
	.allow_console()
	.register(bot)

	new Command("level.set", async function(ctx) {
		let room_id = ctx.event.room_id
		let user_id = ctx.argv[1]
		let level = parseInt(ctx.argv[2]);

		if (level === null || isNaN(level) || level > 50 || level < -50) {
			console.log("Invalid level ${level}");
			return
		}

		let levels = await this.api.v3_state(room_id, "m.room.power_levels");
		
		if (!levels) {
			console.log("Error");
			return
		}

		levels.users[user_id] = level
		
		await this.api.v3_put_state(room_id, "m.room.power_levels", levels)

	})
	.deny_console()
	.allow_any_room()
	.register(bot)


	new Command("level.setall", async function(ctx) {
		let user_id = ctx.argv[1]
		let level = parseInt(ctx.argv[2]);

		if (level === null || isNaN(level) || level > 50 || level < -50) {
			console.log("Invalid level ${level}");
			return
		}

		console.log("Level!")

		for (let room in this.config.rooms) {
			let member = new Member(this, room, user_id)
			await member.set_powerlevel(level)
		}

	})
	.allow_console()
	.allow_any_room()
	.register(bot)

	new Command("trust.get", async function(ctx) {
		let user_id = ctx.argv[1];
		if (!user_id) {
			if (!ctx.event) {
				ctx.reply("No user!")
				return
			}
			
			user_id = ctx.event.sender
		}

		let user = await this.db.get_user(user_id);
		if (!user) {
			ctx.reply("Invalid user!");
			return
		}
		this.calc_trust(user);

		ctx.reply(user.trust)
	})
	.allow_console()
	.allow_any_room()
	.set_level(1)
	.register(bot)


	new Command("db.forget_user", async function(ctx) {
		let user_id = ctx.argv[1];

		let user = await this.db.get_user(user_id);
		if (!user) {
			ctx.reply("Invalid user!");
			return
		}
		user = {_id:user._id}
		await this.db.put_user(user);
		ctx.reply("Dropped")
		
	})
	.allow_console()
	.allow_any_room()
	.register(bot)


	new Command("db.get_user", async function(ctx) {
		let user_id = ctx.argv[1];

		let field = ctx.argv[2];

		let user = await this.db.get_user(user_id);
		if (!user) {
			ctx.reply("Invalid user!");
			return
		}
		if (field) {
			ctx.reply( JSON.stringify(user[field]) )
		} else {
			ctx.reply(JSON.stringify(user, null, 4))
		}
	})
	.allow_console()
	.allow_any_room()
	.register(bot)

	new Command("redact", async function(ctx) {
		let room = ctx.event.room_id
		let user_id = ctx.argv[1];

		let member = new Member(this, room, user_id);
		
		if (!member.is_member()) {
			ctx.reply("Invalid user!");
			return
		}
		
		let redact_id = member.member_event().event_id

		await this.api.v3_redact(room, redact_id, "");

		ctx.reply("User redacted")
	})
	.allow_any_room()
	.register(bot)

	new Command("trust.top", async function(ctx) {
		console.log("Calculating activity ...")
		let users = await this.db.all_users();
		let now = new Date().getTime();

		let fusers = [];

		users.forEach(user=>{
			this.calc_trust(user)
		});

		users.sort((a,b)=>{
			return b.trust - a.trust
		})

		for (let user of users) {
			let since = Util.format_time(now - new Date(user.first_seen).getTime());
			console.log(`${user._id.padEnd(50)} ${(user.trust.toFixed(1)).padEnd(10)}  ${since.padEnd(10)} ${user.msg}`)
		}

	})
	.allow_console()
	.register(bot)


	new Command("activity.top", async function(ctx) {
		console.log("Calculating activity ...")
		let users = await this.db.all_users();

		let room_id = ctx.room_id
		let now = new Date().getTime()

		let fusers = [];

		users.forEach(user=>{
			
			let event_count = 0;

			if (!user.rooms[room_id]) return;

			for (let event in user.rooms[room_id].events)
				event_count += user.rooms[room_id].events[event];
			
			let days = (now - new Date(user.first_seen).getTime()) / 1000 / 60 / 60 / 24;

			let epd = event_count / days
			user.epd = epd;
			user.days = days;
			fusers.push(user)
		});

		users = fusers;

		users.sort((a,b)=>{
			return b.epd - a.epd
		})

		for (let user of users) {
			console.log(`${user._id.padEnd(50)} ${user.epd.toFixed(1).padEnd(5)} e/d  ${Math.floor(user.days)} d`)

		}
	})
	.deny_console()
	.allow_any_room()
	.register(bot)


	new Command("trust.calc", async function(ctx) {
		let users = await this.db.all_users();

		let now = new Date().getTime()

		for (let user of users) {
			let since = Util.format_time(now - new Date(user.first_seen).getTime());
			
			console.log(`${user._id.padEnd(50)} ${since}`)

		}

	})
	.allow_console()
	.register(bot)


	new Command("eval", async function(ctx) {
		try {
			eval(ctx.argv[1]);
		} catch(e) {
			ctx.reply(`${e}`)
		}
	})
	.allow_console()
	.allow_any_room()
	.register(bot)

	new Command("kick", async function(ctx) {
		let room_id = ctx.event.room_id
		let user_id = ctx.argv[1];

		this.api.v3_kick(room_id, user_id, "");
	})
	.deny_console()
	.allow_any_room()
	.register(bot)

	new Command("whitelist", async function(ctx) {
		let user_id = ctx.argv[1];
		let user = await this.db.get_user(user_id);
		if (!user) {
			ctx.reply("Invalid user!");
			return
		}
		user.onjoin = "whitelist"
		await this.db.put_user(user);
		for (let room in this.config.rooms) {
			let member = new Member(this, room, user_id);
			if (member.is_member() && member.powerlevel() <= 0) {
				console.log("Changed in room "+room)
				await member.set_powerlevel(1)
			}
		}
	})
	.allow_console()
	.allow_any_room()
	.register(bot)

	/* Transaction test */
	new Command("whitelist.tx", async function(ctx) {
		let user_id = ctx.argv[1];
		let tx = new Transaction(this.db)
		do {
			let user = await tx.user(user_id)
			console.log("User")
			console.log(user)
			if (!user) {
				ctx.reply("Invalid user!");
				tx.abort()
				return
			}
			user.onjoin = "whitelist"
			console.log("Retry")
			await Util.sleep(1000)
		} while(await tx.retry())

		for (let room in this.config.rooms) {
			let member = new Member(this, room, user_id);
			if (member.is_member() && member.powerlevel() <= 0) {
				console.log("Changed in room "+room)
				await member.set_powerlevel(1)
			}
		}
	})
	.allow_console()
	.allow_any_room()
	.register(bot)



	new Command("mute", async function(ctx) {
		let user_id = ctx.argv[1];
		let user = await this.db.get_user(user_id);
		if (!user) {
			ctx.reply("Invalid user!");
			return
		}
		user.onjoin = "mute"
		await this.db.put_user(user);
		for (let room in this.config.rooms) {
			let member = new Member(this, room, user_id);
			if (member.is_member()) {
				await member.set_powerlevel(-1)
			}
		}
	})
	.allow_console()
	.allow_any_room()
	.register(bot)

	new Command("ban", async function(ctx) {
		let user_id = ctx.argv[1];
		let user = await this.db.get_user(user_id);
		if (!user) {
			ctx.reply("Invalid user!");
			return
		}
		user.onjoin = "ban"
		await this.db.put_user(user);
		for (let room in this.config.rooms) {
			let member = new Member(this, room, user_id);
			if (member.is_member()) {
				await member.ban();
				await member.set_powerlevel(0);
			}
		}
	})
	.allow_console()
	.allow_any_room()
	.register(bot)


	new Command("alljoins", async function(ctx) {

		let room_id = ctx.event?.room_id
		//let room = this.get_room(room_id)

		let query = {room_id:room_id, type:"m.room.member"}
		let ret = await this.db.events.find(query).toArray()
		let users = {}
		for (let e of ret) {
			if (!users[e.state_key]) {
				users[e.state_key] = e
				continue
			}
			if (e.origin_server_ts > users[e.state_key].origin_server_ts) {
				users[e.state_key] = e
			}
		}
		
		fs.writeFile("dump.json", JSON.stringify(users, null, 4))
	})
	.allow_any_room()
	.register(bot)


	new Command("atlevel", async function(ctx) {
		let room_id = ctx.event?.room_id
		let room = this.get_room(room_id)
		let level = parseInt(ctx.argv[1]);

		let action = ctx.argv[2];

		if (level === null || isNaN(level)) {
			console.log("Invalid level ${level}");
			return
		}
	
		let now = new Date().getTime()

		let list = []
		let count = 0

		let query = {room_id:room_id, type:"m.room.member"}
		let ret = await this.db.events.find(query).toArray()
		let users = {}
		for (let e of ret) {
			if (!users[e.state_key]) {
				users[e.state_key] = e
				continue
			}
			if (e.origin_server_ts > users[e.state_key].origin_server_ts) {
				users[e.state_key] = e
			}
		}

		let dump = []

		for (let user_id in users) {
			count++
			let member = room.get_member(user_id)

			let state = users[user_id]
			if (state.content.membership == "join" && member.powerlevel() == level) {

				let fake_event = {
					origin_server_ts: state.origin_server_ts,
					sender: state.state_key,
					room_id: state.room_id,
				}
				let dbuser = await this.get_user_by_event(fake_event)

				list.push(dbuser)
			}
		}
		
		list.sort((a,b)=>{
			return b.first_seen - a.first_seen
		})

		let dumptxt = `Users at level ${level}\n`
		for (let i in list){
			let user = list[i]

			let since = Util.format_time(now - new Date(user.first_seen).getTime());
			let line = `${user._id.slice(1).padEnd(50)} ${since.padEnd(10)}`
			console.log(line)
			dump.push(user._id)
			dumptxt += line + "\n"

		}

		await fs.writeFile("dump.json", JSON.stringify(dump, null, 4))
		await fs.writeFile("dump.txt", dumptxt)
	
		if (action == "kick") {
			for (let user_id of dump) {
				if (this.rooms[room_id].member[user_id]) {
					console.log(`Kick ${user_id}`)
					await this.api.v3_kick(room_id, user_id)
				}
			}
		}
		else if (action == "ban") {
			for (let user_id of dump) {
				console.log(`Ban ${user_id}`)
				await this.api.v3_ban(room_id, user_id)
				await Util.sleep(3000)
			}
		} else {
			if (ctx.event)
				ctx.reply(dumptxt)
		}	

		console.log(count, action)

	})
	.allow_any_room()
	.register(bot)

	new Command("export", async function(ctx) {
		let users = await this.db.users.find( { onjoin: {$ne:null} } ).toArray()
		if (!users) {
			console.log("Users undefined")
		}
		let file = {}
		users.forEach((user)=>{
			file[user._id] = {onjoin:user.onjoin}
		})
		let data = JSON.stringify(file, null, 4) 
		console.log(data)
		await fs.writeFile("export.json", data)
	})
	.allow_console()
	.register(bot)

	new Command("import", async function(ctx) {

		let data = JSON.parse(await fs.readFile("export.json", "utf8"))
		console.log(data)
		for (let key in data) {
			let user = data[key]
			console.log(key, user)

			let dbuser = await this.db.get_user(key);
			if (!user) {
				ctx.reply("Invalid user!");
				return
			}
			dbuser.onjoin = user.onjoin
			await this.db.put_user(dbuser);
		}
	})
	.allow_console()
	.register(bot)
	

	/* TODO store ACL in database? */
	new Command("acl", async function(ctx) {
		if (!ctx.argv[1]) {
			ctx.reply("Server needed")
			return
		}

		let acl = JSON.parse(await fs.readFile("acl.json", "utf8"))
		
		acl.deny.push(ctx.argv[1])

		await fs.writeFile("acl.json", JSON.stringify(acl, null, 4))
		ctx.reply(`${ctx.argv[1]} added to ACL`)
	})
	.allow_console()
	.allow_any_room()
	.register(bot)


	new Command("acl.fromdump", async function(ctx) {

		let acl = JSON.parse(await fs.readFile("acl.json", "utf8"))
		let raid = JSON.parse(await fs.readFile("dump.json", "utf8"))

		let hs = {}

		for (let user_id of raid) {
			hs[user_id.split(":")[1]] = true
		}

		for (let domain of acl.deny) {
			hs[domain] = true
		}

		delete acl.deny
		acl.deny = []

		for (let domain in hs) {
			acl.deny.push(domain)
		}

		let txt = JSON.stringify(acl, null, 4) 
		console.log(txt)
		await fs.writeFile("acl.json", txt)

	})
	.allow_console()
	.allow_any_room()
	.register(bot)

	new Command("acl.reload", async function(ctx) {

		let data = JSON.parse(await fs.readFile("acl.json", "utf8"))

		for (let room_id in this.config.rooms) {
			if (!this.config.rooms[room_id].manage) {
				continue
			}
			await this.api.v3_put_state(room_id, "m.room.server_acl", data)
		}
	})
	.allow_console()
	.allow_any_room()
	.register(bot)


	new Command("joinrule", async function(ctx) {
		let room_id = ctx.event.room_id
		let rule = ctx.argv[1]
		if (rule != "public" && rule != "invite") {
			ctx.reply(`Invalid argument ${rule}, use public or invite`)
			return
		}

		const data = {
			join_rule: rule
		}
		await this.api.v3_put_state(room_id, "m.room.join_rules", data)
	})
	.allow_console()
	.allow_any_room()
	.register(bot)

	await bot.init()
	//await bot.build_user_db()
	bot.sync()
	
	while(!bot.exit) {
		const ret = await rl.question('/');

		let argv = parse_command(ret)
		console.log(argv)
		bot.run_command(argv, null);
	}
}

await main()
