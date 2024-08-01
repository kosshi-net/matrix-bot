import fs from "node:fs/promises";

//import { Util } from "./utils.mjs"
import { CommandManager } from "./command.mjs";

import { MatrixAPI } from "./matrix-api.mjs";
import { Database } from "./database.mjs";
import { pHashManager } from "./phash-manager.mjs";
import { Scheduler } from "./scheduler.mjs";
import { Util } from "./utils.mjs";

async function import_history(db:Database) {
	console.log("Importing history ...");
	const import_folder = "./history";
	let readdir = await fs.readdir(import_folder, { withFileTypes: true });

	let dirs = readdir
		.filter((dirent) => dirent.isDirectory())
		.map((dirent) => dirent.name);

	let room_meta = {
		_id: "rooms",
		rooms: {},
	};
	for (let room of dirs) {
		let token = "s0_0_0_0_0_0_0_0_0_0";

		let event_count = 0;
		let insert_count = 0;

		let last_event = null;

		while (token) {
			let page = JSON.parse(
				await fs.readFile(
					`${import_folder}/${room}/${token}.json`,
					"utf8",
				),
			);
			event_count += page.chunk.length;
			token = page.end;

			for (let e of page.chunk) {
				e._id = e.room_id + e.event_id;
			}

			if (page.chunk.length > 0) {
				let ret = await db.events.insertMany(page.chunk);
				insert_count += ret.insertedCount;

				last_event = page.chunk.slice(-1)[0];
			}
		}
		console.log(`Imported ${event_count} events from ${room}`);

		if (insert_count != event_count) {
			throw "Insert and event counts don't match.";
		}

		let e = last_event;
		room_meta.rooms[e.room_id] = {
			last_event: e.event_id,
		};
	}
	await db.put_meta(room_meta);
}

class Room {
	bot: Bot;
	id: RoomID;
	/* This a R/W interface on top of class Bot's JSON data */
	constructor(bot:Bot, room_id:RoomID) {
		this.bot = bot;
		this.id = room_id;
	}

	get_member(user_id:UserID): Member {
		return new Member(this.bot, this.id, user_id);
	}

	get_user(user_id:UserID): Member {
		return this.get_member(user_id);
	}

	get_all_memberships(): Map<UserID, string> {
		console.log("!!!! TESTING ", this.id);
		let membership = new Map<UserID, string>;
		for (let key in this.bot.rooms[this.id].member) {
			let e = this.bot.rooms[this.id].member[key];
			console.log(e);
			membership.set(e.state_key, e.content.membership);
		}
		
		return membership;
	}

}

class Member {
	bot: Bot;
	room_id: RoomID;
	id:      UserID;
	constructor(bot:Bot, room_id:RoomID, user_id:UserID) {
		this.bot = bot;
		this.room_id = room_id;
		this.id = user_id;
	}

	is_banned(): boolean {
		let event = this.bot.rooms[this.room_id].member[this.id];
		if (!event) return false;
		return event.content?.membership === "ban";
	}

	is_member(): boolean {
		let event = this.bot.rooms[this.room_id].member[this.id];
		if (!event) return false;
		return event.content?.membership === "join";
	}

	member_event() {
		return this.bot.rooms[this.room_id].member[this.id];
	}

	async kick() {
		return await this.bot.api.v3_kick(this.room_id, this.id, "");
	}


	async unban() {
		return await this.bot.api.v3_unban(this.room_id, this.id, "");
	}

	async ban() {
		return await this.bot.api.v3_ban(this.room_id, this.id, "");
	}

	powerlevel(): number {
		let event = this.bot.rooms[this.room_id].state["m.room.power_levels"];

		if (!event) {
			console.log(this.bot.rooms[this.room_id]);
			console.log(this.room_id);
			console.log(this.id);
			throw "Unable to find m.room.power_levels state event";
		}

		let level = event?.content?.users[this.id];

		if (!level) level = event.users_default;
		if (!level) level = 0;

		return level;
	}

	async set_powerlevel(level:number) {
		let levels = await this.bot.api.v3_state(
			this.room_id,
			"m.room.power_levels",
		);
		if (!levels) {
			throw "Failed to fetch m.room.power_levels";
		}
		levels.users[this.id] = level;
		if (level == 0) delete levels.users[this.id];
		await this.bot.api.v3_put_state(
			this.room_id,
			"m.room.power_levels",
			levels,
		);
	}

	get displayname() {
		let name =
			this.bot.rooms[this.room_id].member[this.id].content.displayname;
		if (!name) name = this.id.split(":")[0];
		return name;
	}
}

class Bot {
	config: BotConfig;
	db:     Database;
	api:    MatrixAPI;
	phash:  pHashManager;
	sched:  Scheduler;
	rooms:  any;
	exit:   boolean;
	var: {
		_counter: number,
		unsynced: boolean,
		joins: {
			rooms: {
				[index:string] : {
					list:Array<string>,
					count: number
				} 
			},
			timeout: any, /* For join alert */
		}
	};
	
	cmd:CommandManager;

	constructor(config:BotConfig) {
		this.config = config;
		this.db        = new Database(this.config);
		this.api       = new MatrixAPI(this.config);
		this.cmd       = new CommandManager(this);
		this.phash     = new pHashManager(this);
		this.sched     = new Scheduler(this);

		this.var = {
			_counter: 0,
			unsynced: true,
			joins: {
				rooms:{},
				timeout: 0 
			}
		};

		
		this.reset_join_counters();
		setInterval(this.reset_join_counters.bind(this), 
			1000 * 60 // Minute
			* 60
		);

		this.rooms = {};
		this.exit = false;
	}

	reset_join_counters(){
		for (let room_id in this.config.rooms) {
			this.var.joins.rooms[room_id] = {
				list: [],
				count: 0,
			};
		}
	}


	async close() {
		await this.db.close();
	}

	async init() {
		if (process.env.WIPE_DB == "1") {
			await this.db.wipe();
		}
		/* Check DB */
		let dbmeta = await this.db.get_meta("status");
		console.log(dbmeta);
		if (!dbmeta) await this.init_db();
		console.log("DB OK");
	}

	async sync() {
		console.log("Begin sync loop");
		while (!this.exit) {
			let sync = await this.api.v3_sync();
			//console.log(sync)
			await this.sync_tick(sync);
		}
	}

	/* Main event handler */
	async event(e) {
		if (!e.room_id || !e.event_id) {
			throw "Malformed event";
		}

		if (this.config.rooms[e.room_id]?.manage !== true) {
			return;
		}

		let e2 = await this.db.get_event(e.room_id, e.event_id);

		let tags = [];

		if (e2 == null) {
			await this.db.new_event(e);
			await this.userdb_event(e);
			this.var._counter++;
			if (e.content?.msgtype == "m.image") {
				void this.phash.check(e);
			}
		} else {
			tags.push("old");
		}

		/* This is a state event. Update internal room status */
		if (e.state_key === "") {
			tags.push("state");
			this.rooms[e.room_id].state[e.type] = e;
		}

		if (e.type == "m.room.member") {
			this.rooms[e.room_id].member[e.state_key] = e;
			tags.push(e.event_id);
		}

		let live = false;
		if (e2 == null && this.var.unsynced == false) {
			live = true;
			tags.push("live");

			let stripped_body = e.content?.body;

			if (stripped_body && stripped_body[0] == ">" && stripped_body.search("\n\n") != -1) {
				stripped_body = stripped_body.split("\n\n")[1];
				if (!stripped_body) stripped_body = e.content?.body;
			}

			if (
				e.type == "m.room.message" &&
				e.content?.msgtype == "m.text" &&
				stripped_body[0] == "!"
			) {
				console.log(`Running command ${e.content.body}`);
				//this.run_command(argv, e);
				await this.cmd.run(e);
			}

			if (e.type == "m.room.member") {
				await this.join_alert(e);
			}

		}

		if (e.type == "m.room.message") {
			tags.push(e.content.msgtype);
		}


		console.log(
			`${tags.join(" ")} ${e.type} ${e.sender} ${this.rooms[e.room_id]?.name || e.room_id} `,
		);

		if (e.type == "m.room.message") {
			console.log(` >  ${e.content?.body}`);

			if (this.config.rooms[e.room_id].word_filter) {
				await this.word_filter(e);
			}
		}
	}

	async word_filter(e) {
		let content = e.content?.body;
		if (!content) return;

		content = content.toLowerCase();
		for (let alias of this.config.letter_alias) {
			content = content.replaceAll(alias[0], alias[1]);
		}

		for (let word of this.config.word_filter) {
			if (content.search(word) >= 0) {
				await this.api.v3_redact(e.room_id, e.event_id, "Word filter");
			}
		}
	}

	async sync_tick(sync) {
		if (!sync.rooms) return;

		let room_meta = await this.db.get_meta("rooms");
		if (!room_meta) throw "No room meta"; // TODO this is to shut up TS, investigate what's going on

		for (let _room_id in sync.rooms.join) {
			let room_id = _room_id as RoomID; // TODO silly cast

			this.rooms[room_id] ??= {
				state: {},
				member: {},
			};

			let room = sync.rooms.join[room_id];

			for (let state of room.state.events) {
				if (state.type == "m.room.member") {
					this.rooms[room_id].member[state.state_key] = state;
				} else {
					this.rooms[room_id].state[state.type] = state;
				}
			}

			if (this.config.rooms[room_id]?.manage !== true) continue;

			/* Managed room code */

			if (room.timeline?.limited) {
				console.log("Limited timeline, resyncing room via context...");
				await this.sync_room(room_id);
				console.log("Room synced");
			}

			for (let e of room.timeline.events) {
				e.room_id = room_id;
				await this.event(e);


				room_meta.rooms[room_id] ??= {};
				room_meta.rooms[room_id].last_event = e.event_id;
			}
		}

		if (this.var.unsynced) {
			for (let room_id in this.rooms) {
				let room = this.rooms[room_id];

				let name;

				let name_event = room.state["m.room.name"];
				let create_event = room.state["m.room.create"];
				let alias_event = room.state["m.room.canonical_alias"];

				name = name_event?.content?.name;

				if (!name) name = alias_event?.content?.alias;

				if (!name) name = create_event.sender;

				if (create_event.content.type == "m.space")
					console.log(`${name} (Space)`);
				else console.log(name);

				this.rooms[room_id].name = name;
			}
			console.log("!!! LIVE !!!");
		}

		if (!this.var.unsynced) {
			await this.db.put_meta(room_meta);
		}

		this.var.unsynced = false;
	}

	async send_mention(room_id:RoomID, mentions:Array<UserID>, body:string) {
		let content = {
			body: "",
			format: "org.matrix.custom.html",
			formatted_body: "",
			msgtype: "m.text",
		};

		let room = this.get_room(room_id);

		mentions.forEach((user_id:UserID) => {
			let member = room.get_member(user_id);
			let name = member.displayname;

			if (content.body != "") {
				content.body += " ";
				content.formatted_body += " ";
			}
			content.body += `${name}`;

			content.formatted_body += `<a href="https://matrix.to/#/${member.id}">${name}</a>`;
		});

		content.body += `: ${body}`;
		content.formatted_body += `: ${body}`;

		content.formatted_body = content.formatted_body.replace(/\n/g, "<br>");

		await this.api.v3_send(room_id, "m.room.message", content);
	}

	get_member(room_id:RoomID, user_id:UserID) {
		let member = new Member(this, room_id, user_id);
		return member;
	}

	get_room(room_id:RoomID) {
		let room = new Room(this, room_id);
		return room;
	}

	get_alias(room_id:RoomID):RoomAlias {
		let room = this.rooms[room_id];
		let e = room.state["m.room.canonical_alias"];
		
		let alias = e?.content?.alias;
		if(alias) 
			return alias;
		else 
			return room_id;
	}

	resolve_room(alias:RoomAlias): RoomID {
		if (alias[0] == "!") 
			return alias as RoomID;

		for (let room_id in this.rooms) {
			let room = this.rooms[room_id];
			let e = room.state["m.room.canonical_alias"];
			if (e?.content?.alias == alias) {
				console.log(`Resolved ${alias} as ${room_id}`);
				return room_id as RoomID;
			}
		}

		throw `Failed to resolve ${alias}`;
	}


	async join_alert(e) {
		let room = this.get_room(e.room_id);
		let user = room.get_user(e.state_key);

		console.log(`Power level: ${user.powerlevel()}`);

		console.log("Join alert?");
		if (e.content.membership != "join") return;

		console.log("Unfiltered join");

		if (
			e.unsigned?.prev_content &&
			e.unsigned.prev_content.membership == "join"
		)
			return;

		/* Add for flood counting */
		this.var.joins.rooms[room.id].count++;
		
		if (this.var.joins.rooms[room.id].count >= 10 ) 
		{
			const data = {join_rule: "invite"};
			await this.api.v3_put_state(
				room.id,
				"m.room.join_rules", 
				data
			);

			await this.send_mention(
				room.id,
				[this.config.owner_id],
				"Flood detected, room in lockdown."
			);
		}

		let dbuser = await this.db.get_user(user.id);
		if (!dbuser) throw "No dbuser"; // TODO to shut up TS, investigate later

		if (dbuser.onjoin === "mute") {
			console.log("Muted due to .onjoin");
			await user.set_powerlevel(-1);
			return;
		}

		if (dbuser.onjoin === "ban") {
			console.log("Banned due to .onjoin");
			await user.ban();
			return;
		}

		if (user.powerlevel() != 0) return;

		let idname = e.state_key.split(":")[0].slice(1);
		let domain = e.state_key.split(":")[1];
		if (!e.content.avatar_url && domain == "matrix.org" &&
			(e.content.displayname == idname || !e.content.displayname)
		) {
			/* Probably a bot account, kick it */

			setTimeout(async () => {
				// TODO this will throw unhandled!
				await this.api.v3_ban(
					room.id,
					user.id,
					"You seem like a bot. To bypass, set an avatar or a displayname. This ban expires in 5 minutes."
				);
				await this.sched.once(
					`unban ${room.id} ${user.id}`,
					Util.parse_time("5min")
				);
			}, 1500);
			return;
		}


		console.log("Alert!");

		this.calc_trust(dbuser);
		console.log(`Trust ${dbuser.trust}`);

		if (dbuser.trust >= 2) {
			await user.set_powerlevel(1);
			return;
		}

		if (this.config.trust_domains[user.id.split(":")[1]] === true) {
			console.log("Whitelisted due to trusted domain");
			await user.set_powerlevel(1);
			return;
		}

		if (this.config.rooms[room.id].trusted_only) {
			setTimeout(async () => {
				// TODO this will throw unhandled!
				await this.api.v3_ban(
					room.id,
					user.id,
					this.config.gatekeep_kick_message,
				);
				await this.sched.once(
					`unban ${room.id} ${user.id}`,
					Util.parse_time("30min")
				);
			}, 1500);

			console.log("Kick user due to insufficient trust");
			return;
		}

		if (dbuser.onjoin === "whitelist") {
			console.log("Whitelisted due to .onjoin");
			await user.set_powerlevel(1);
			return;
		}



		this.var.joins.rooms[room.id].list.push(user.id);
		if (this.var.joins.timeout == 0) {
			this.var.joins.timeout = setTimeout(this.join_alert_timeout.bind(this), 2000);
		}
	}

	async join_alert_timeout() {

		for (let room_id in this.var.joins.rooms) {
			let r = this.var.joins.rooms[room_id];
			if (r.list.length == 0) continue;

			r.list.push(this.config.owner_id);
			await this.send_mention(

				/* TODO FIX THESE DIRTY CASTS!!!!!! 
				 * Strong type the internal room state!!! */

				room_id as RoomID, 
				r.list as UserID[],
				this.config.gatekeep_mute_message,
			);

			r.list = [];
		}

		this.var.joins.timeout = 0;
	}


	async sync_room(room_id:RoomID) {
		let room_meta = await this.db.get_meta("rooms");
		if (!room_meta) throw "no room meta"; // TODO to shut up TS, investigate later
		let last_event = room_meta.rooms[room_id]?.last_event;
		
		if (!last_event) {
			/* New room was added! */
			room_meta.rooms[room_id] = {};
			await this.db.put_meta(room_meta);
			return;
		}

		let context = await this.api.v3_context(room_id, last_event, 50);

		console.log("Old events");
		for (let e of context.events_before) {
			await this.event(e);
		}
		console.log("New events");

		for (let e of context.events_after) {
			await this.event(e);
			last_event = e.event_id;
		}

		let token = context.end;

		while (token) {
			console.log(token);
			let page = await this.api.v3_messages(room_id, token, 100);

			for (let e of page.chunk) {
				await this.event(e);
				last_event = e.event_id;
			}

			console.log(this.var._counter, token, page.end);
			token = page.end;
		}

		room_meta.rooms[room_id].last_event = last_event;
		await this.db.put_meta(room_meta);

		console.log(`Synced ${room_id}`);

		console.log(`${this.var._counter} new events`);
		this.var._counter = 0;
	}

	async init_db() {
		await import_history(this.db);

		await this.db.put_meta({ _id: "status", initialized: true });
		console.log("Initial DB!");

		console.log(await this.db.meta.find().toArray());
	}

	async get_user_by_event(e) {
		let user = await this.db.get_user(e.sender);

		user ??= {
			_id: e.sender,
			first_seen: new Date(),
			rooms: {},
		};

		let e_time = new Date(e.origin_server_ts);
		if (e_time < user.first_seen) user.first_seen = e_time;

		user.rooms[e.room_id] ??= {
			events: {},
			redacted: {
				recv: {},
				sent: {},
				self: {},
			},

			reactions: {
				sent: {},
				recv: {},
				self: {},
			},
		};

		return user;
	}

	async build_user_db() {
		let events = await this.db.events.find().toArray();
		console.log("Wipe user collection ...");
		await this.db.users.deleteMany({});

		//await fs.writeFile("dbevents.json", JSON.stringify(events, null, 4))

		console.log("Rebuilding user db...");
		let last = new Date();
		let last_i = 0;
		for (let i = 0; i < events.length; i++) {
			let e = events[i];
			await this.userdb_event(e);

			let prog = Math.floor((i / events.length) * 100);
			let now = new Date();

			if (last.getTime() + 1000 < now.getTime()) {
				last = now;

				console.log(`${prog}%, ${i - last_i} e/s`);
				last_i = i;
			}
		}

		let users = await this.db.users.find().toArray();
		console.log(users.length);
		await fs.writeFile("dbusers.json", JSON.stringify(users, null, 4));
	}

	async userdb_reaction(e, redaction = false) {
		/* Redacted event, don't count */
		if (e.content["m.relates_to"] === undefined) return;

		let val = redaction ? -1 : 1;

		if (e.type == "m.reaction") {
			let rel = e.content["m.relates_to"];
			let key = rel?.key;
			if (!key) throw "No key in m.reaction";

			let t = await this.db.get_event(e.room_id, rel.event_id);
			if (!t) throw "Failed to find related event";

			if (e.sender == t.sender) {
				let sender = await this.get_user_by_event(e);

				sender.rooms[e.room_id].reactions.self[key] ??= 0;
				sender.rooms[e.room_id].reactions.self[key] += val;

				await this.db.put_user(sender);
			} else {
				let sender = await this.get_user_by_event(e);
				let target = await this.get_user_by_event(t);

				sender.rooms[e.room_id].reactions.sent[key] ??= 0;
				sender.rooms[e.room_id].reactions.sent[key] += val;

				target.rooms[e.room_id].reactions.recv[key] ??= 0;
				target.rooms[e.room_id].reactions.recv[key] += val;

				await this.db.put_user(sender);
				await this.db.put_user(target);
			}
		}
	}

	async userdb_redaction(e) {
		let sender = await this.get_user_by_event(e);

		let r = await this.db.get_event(e.room_id, e.redacts);
		if (!r) {
			//throw "Failed to find redacted event"
			console.log("WARNING: Failed to find redaced event");
			return;
		}

		if (e.sender == r.sender) {
			sender.rooms[e.room_id].redacted.self[r.type] ??= 0;
			sender.rooms[e.room_id].redacted.self[r.type] += 1;
		} else {
			sender.rooms[e.room_id].redacted.sent[r.type] ??= 0;
			sender.rooms[e.room_id].redacted.sent[r.type] += 1;

			let target = await this.get_user_by_event(r);
			target.rooms[e.room_id].redacted.recv[r.type] ??= 0;
			target.rooms[e.room_id].redacted.recv[r.type] += 1;
			await this.db.put_user(target);
		}
		await this.db.put_user(sender);

		if (r.type == "m.reaction") await this.userdb_reaction(r, true);
	}

	async userdb_event(e) {
		if (!e.room_id || !e.event_id || !e.sender) {
			throw "Malformed event";
		}

		let user = await this.get_user_by_event(e);
		user.rooms[e.room_id].events[e.type] ??= 0;
		user.rooms[e.room_id].events[e.type]++;
		await this.db.put_user(user);

		if (e.type == "m.room.redaction") {
			await this.userdb_redaction(e);
		}

		if (e.type == "m.reaction") {
			await this.userdb_reaction(e);
		}
	}

	async user_event_old(e) {
		if (!e.room_id || !e.event_id || !e.sender) {
			throw "Malformed event";
		}

		let u = {};

		u[e.sender] ??= await this.get_user_by_event(e);
		u[e.sender].rooms[e.room_id].events[e.type] ??= 0;
		u[e.sender].rooms[e.room_id].events[e.type]++;

		if (e.type == "m.room.redaction") {
			let r = await this.db.get_event(e.room_id, e.redacts);
			if (!r) throw "Failed to find redacted event";

			if (e.sender == r.sender) {
				u[e.sender] ??= await this.get_user_by_event(e);

				u[e.sender].rooms[e.room_id].redacted.self[r.type] ??= 0;
				u[e.sender].rooms[e.room_id].redacted.self[r.type] += 1;
			} else {
				u[e.sender] ??= await this.get_user_by_event(e);
				u[e.sender].rooms[e.room_id].redacted.sent[r.type] ??= 0;
				u[e.sender].rooms[e.room_id].redacted.sent[r.type] += 1;

				u[r.sender] ??= await this.get_user_by_event(r);
				u[r.sender].rooms[e.room_id].redacted.recv[r.type] ??= 0;
				u[r.sender].rooms[e.room_id].redacted.recv[r.type] += 1;
			}

			if (r.type == "m.reaction" && r.content?.["m.relates_to"]) {
				/* r = redacted reaction event, t = target event */
				let rel = r.content["m.relates_to"];
				let key = rel.key;

				let t = await this.db.get_event(e.room_id, rel.event_id);
				if (!t) throw "Failed to find related event";

				if (r.sender != t.sender) {
					u[r.sender] ??= await this.get_user_by_event(r);
					u[r.sender].rooms[e.room_id].reactions.sent[key] ??= 0;
					u[r.sender].rooms[e.room_id].reactions.sent[key]--;

					u[t.sender] ??= await this.get_user_by_event(t);
					u[t.sender].rooms[e.room_id].reactions.recv[key] ??= 0;
					u[t.sender].rooms[e.room_id].reactions.recv[key]--;
				}
			}
		}

		/* Historical redacted reactions don't have content or relates to,
		 * making them impossible to count */

		if (e.type == "m.reaction" && !e.redacted_because) {
			let rel = e.content["m.relates_to"];
			let key = rel?.key;

			let t = await this.db.get_event(e.room_id, rel.event_id);
			if (!t) throw "Failed to find related event";

			/* Don't count self-reactions for now */
			if (e.sender != t.sender) {
				u[e.sender] ??= await this.get_user_by_event(e);
				u[e.sender].rooms[e.room_id].reactions.sent[key] ??= 0;
				u[e.sender].rooms[e.room_id].reactions.sent[key]++;

				u[t.sender] ??= await this.get_user_by_event(t);
				u[t.sender].rooms[e.room_id].reactions.recv[key] ??= 0;
				u[t.sender].rooms[e.room_id].reactions.recv[key]++;
			}
		}

		let promises = [];
		for (let user in u) {
			promises.push(this.db.put_user(u[user]));
		}

		await Promise.all(promises);
	}

	calc_trust(user) {
		let now = new Date().getTime();
		user.trust = 0;
		let points = 0;
		let reactions = 0;
		for (let room in user.rooms) {
			let n = user.rooms[room].events["m.room.message"];
			if (n) points += n;

			n = user.rooms[room].events["m.reaction"];
			if (n) points += n;

			for (let key in user.rooms[room].reactions.recv) {
				reactions += user.rooms[room].reactions.recv[key];
			}
		}

		/* Trust levels
		 * 0 - Baseline. Not allowed to talk.
		 * 1 - Freshly joined user.
		 * 2 - Lightly trusted user. Whitelisted on all rooms.
		 * 4 - Full trust
		 * 6 - Extra trusted. Newfriends invited by user get
		 * 10 - Max trust
		 */

		let days =
			(now - new Date(user.first_seen).getTime()) / 1000 / 60 / 60 / 24;

		user.points = points;

		points += reactions;

		let trust = 0;
		if (points >= 1) trust = 1;

		if (days >= 1 && points >= 10) trust = 2;
		if (days >= 7 && points >= 50) trust = 3;
		if (days >= 14 && points >= 100) trust = 4;

		let trust_r = Math.sqrt(reactions) / 10;
		let trust_d = Math.sqrt(days) / 10;
		let trust_a = Math.sqrt(points) / 100;

		trust_d = Math.min(trust_d, trust_a + trust_r);
		if (trust >= 4) trust += trust_r + trust_d + trust_a;

		user.msg = `${trust_a.toFixed(1)}a ${trust_r.toFixed(1)}r ${trust_d.toFixed(1)}d`;

		user.reactions = reactions;
		user.trust = trust;

		return user;
	}



	async react(event:any, key:string) {

		let content = {
			"m.relates_to": {
				event_id: event.event_id,
				key: key,
				rel_type: "m.annotation"
			}
		};

		await this.api.v3_send(event.room_id, "m.reaction", content);

	}


}

export { Bot, Room, Member };
