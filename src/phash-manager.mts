import { Bot } from "./bot.mjs";
import fs from "node:fs/promises";
import {phash} from "./phash.mjs";

class pHashManager {
	bot:Bot;
	cache: Map<string, boolean>;

	constructor(bot:Bot) {
		this.bot = bot;
		this.cache = new Map<string, boolean>;
	}

	async hash(mxc:string):Promise<string> {
		
		let u = new URL(mxc);
		let url = `https://${this.bot.config.hostname}/_matrix/media/v3/download/${u.host}${u.pathname}`;

		let destination = `${u.host}${u.pathname}`.replaceAll(".", "_").replaceAll("/", "-");
		destination = "/tmp/"+destination;

		console.log(`Downloading ${url}`);
		let r = await fetch(url);

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
		
		let hash = await phash.hash(destination);
		
		await fs.unlink(destination);

		return hash;
	}

	async check(event:any){
		
		if (event.content?.msgtype != "m.image") {
			return;
		}

		let mime = event.content?.mime;
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
		
		
	}

}

export { pHashManager };
