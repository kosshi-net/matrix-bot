import { Bot } from "./bot.mjs";
import { Database } from "./database.mjs";

interface ScheduledEvent {
	cmd:     string,
	ts_next: number,
	ts_step: number,
	repeat:  boolean,
};

class Scheduler {
	bot: Bot;
	db:  Database;
	
	constructor(bot:Bot) {
		this.bot = bot;
		this.db = bot.db;
		setInterval(this.tick.bind(this), 1000);
	}

	async once(cmd:string, ts:number):Promise<ScheduledEvent> {
		let now = new Date().getTime();
		let doc:ScheduledEvent = {
			cmd:     cmd,
			ts_next: now+ts,
			ts_step: ts, 
			repeat:  false
		};

		await this.db.schedule.insertOne(doc);

		return doc;
	}

	async tick() {
		if (this.bot.var.unsynced) return;

		let ts = new Date().getTime();
		let query = {ts_next:{$lt:ts}};
		let list = await this.db.schedule.find(query).toArray();

		for (let item of list) {
			await this.db.schedule.deleteOne({_id:item._id});
			await this.bot.cmd.run(null, `!${item.cmd}`);
		}
	}
}


export { Scheduler, ScheduledEvent };
