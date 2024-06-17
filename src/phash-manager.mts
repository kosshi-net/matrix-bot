import { Bot } from "./bot.mjs";
import fs from "node:fs/promises";
import {phash} from "./phash.mjs";

class pHashManager {
	bot:Bot;
	cache: Array<Buffer>;

	constructor(bot:Bot) {
		this.bot = bot;
		this.cache = [];
		void this.load();
	}

	async load() {
		let arr = await this.bot.db.phash.distinct("phash");
		
		for (let hash of arr) {
			this.cache.push( Buffer.from(hash, "hex") );
		}
		
		console.log(`Loaded ${arr.length} phashes`);
	}

	async hash(mxc:string):Promise<string> {
		
		let t_begin = performance.now();

		let u = new URL(mxc);
		let url = `${this.bot.config.matrix.protocol}//${this.bot.config.matrix.hostname}:${this.bot.config.matrix.port}/_matrix/media/v3/download/${u.host}${u.pathname}`;

		let destination = `${u.host}${u.pathname}`.replaceAll(".", "_").replaceAll("/", "-");
		destination = "/tmp/"+destination;

		console.log(`Downloading ${url}`);
		let r = await fetch(url);
		
		let t_downloaded = performance.now();

		if (r.status != 200) {
			throw `Error: status code ${r.status}\n${url}\n`;
		}

		let type = r.headers.get("content-type").split("/");

		if (type[0] != "image") {
			throw "Error: Wrong content type\n";
		}

		let extension = type[1];

		const buffer = Buffer.from( await r.arrayBuffer() );
		
		destination = `${destination}.${extension}`;

		await fs.writeFile(destination, buffer);

		let t_wrote = performance.now();
		
		let hash = await phash.hash(destination);

		let t_hashed = performance.now();
		
		await fs.unlink(destination);

		let t_finished = performance.now();


		console.log(`Download: ${t_downloaded - t_begin} ms`);
		console.log(`Write:    ${t_wrote - t_downloaded} ms`);
		console.log(`Hash:     ${t_hashed - t_wrote} ms`);
		console.log(`Finish:   ${t_finished - t_hashed} ms`);
		console.log(`Total:    ${t_finished - t_begin} ms`);


		return hash;
	}

	async get_matches(hash:string):Promise<Array<string>> {
		let hash_list = [];

		let hb = Buffer.from(hash, "hex");

		for (let h2 of this.cache) {
			let delta = phash.compare_buffer(hb, h2);
			if (delta < 2) {
				hash_list.push(h2.toString('hex').padStart(16, '0') );
			}
		}


		const query = { phash: { $in: hash_list } };
		let ret = await this.bot.db.phash.find(query).toArray();
		
		let results = [];

		for (let doc of ret) {
			results.push(doc._id);
		}

		console.log(ret);
		console.log(hash_list);

		return results;
	}

	async check(event:any, react: boolean = true) {
		
		if (this.bot.config.rooms[event.room_id].phash != true) {
			return;
		}

		if (event.content?.msgtype != "m.image") {
			return;
		}

		let mime = event.content?.info?.mimetype;
		switch (mime) {
		case "image/jpeg":
		case "image/png":
			break;
		default:
			return;
		}


		let mxc = event.content.url;
		if (!mxc) return;

		let h:string;
		try {
			h = await this.hash(mxc);
		} catch (err) {
			console.error(`Failed to hash the image of an event ${event.event_id}`);
			console.error(err);
			return;
		}
		
		console.log(h);
		

		let hb = Buffer.from(h, "hex");

		if (react)
		for (let h2 of this.cache) {
			let delta = phash.compare_buffer(hb, h2);
			if (delta < 2) {
				await this.bot.react(event, "♻️");
				break;
			}
		}
		
		/* Insert */
		this.cache.push(hb);

		let doc = {
			_id:   mxc,
			phash: h,
		};
		
		await this.bot.db.phash.updateOne(
			{ _id: doc._id },
			{ $set: doc },
			{ upsert: true },
		);

	}

}

export { pHashManager };
