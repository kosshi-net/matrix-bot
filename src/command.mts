// @ts-check
"use strict";

class CommandContext {
	bot: any;
	argv: Array<string>;
	event: any;

	constructor(bot: any, argv: Array<string>, event: any) {
		this.bot = bot;
		this.argv = argv;
		this.event = event;
	}

	reply(msg: string) {
		if (this.event) {
			this.bot.send_mention(this.event.room_id, [this.event.sender], msg);
		} else {
			console.log(msg);
		}
	}
}

class Command {
	ready_on: number;
	name: string;
	fn: Function;
	filter: any;

	constructor(name: string, fn: Function) {
		this.ready_on = 0;
		this.name = name;
		this.fn = fn;
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
	allow_console() {
		this.filter.console = true;
		return this;
	}
	deny_console() {
		this.filter.console = false;
		return this;
	}

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
	register(bot: any) {
		bot.register_command(this);
		console.log(this);
	}
}

export { Command, CommandContext };
