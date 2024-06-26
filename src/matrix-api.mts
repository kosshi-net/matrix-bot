import { Util } from "./utils.mjs";
import { StatusCodes } from "http-status-codes";

class MatrixAPI {
	config: BotConfig;

	txn: number;
	sync_status: {
		next: string;
		timeout: number;
	};

	constructor(config: BotConfig) {
		this.txn = new Date().getTime();

		this.sync_status = {
			next: null,
			timeout: 4000,
		};
		this.config = config;
	}

	async v3_send(room_id: RoomID, event_type: string, content: any) {
		let txn = (this.txn++).toString();
		let call = {
			method: "PUT",
			path: `/_matrix/client/v3/rooms/${room_id}/send/${event_type}/${txn}`,
			hostname: this.config.matrix.hostname,
			port:     this.config.matrix.port,
			protocol: this.config.matrix.protocol,
			headers: {
				Authorization: `Bearer ${this.config.matrix.token}`,
			},
		};
		let body = JSON.stringify(content);
		let ret = await this.request(call, body);
		return JSON.parse(ret.body);
	}

	async v3_context(room_id: RoomID, event_id: string, limit = 10) {
		let call = {
			path: `/_matrix/client/v3/rooms/${room_id}/context/${event_id}?limit=${limit}`,
			hostname: this.config.matrix.hostname,
			port:     this.config.matrix.port,
			protocol: this.config.matrix.protocol,
			headers: {
				Authorization: `Bearer ${this.config.matrix.token}`,
			},
		};
		let ret = await this.request(call, null);
		if (ret.code != 200) throw `Server responded with ${ret.code}`;
		let context = JSON.parse(ret.body);
		return context;
	}

	async v3_state(room_id: RoomID, type: string) {
		let opt = "";
		if (type) {
			opt = `/${type}`;
		}
		let call = {
			path: `/_matrix/client/v3/rooms/${room_id}/state${opt}`,
			hostname: this.config.matrix.hostname,
			port:     this.config.matrix.port,
			protocol: this.config.matrix.protocol,
			headers: {
				Authorization: `Bearer ${this.config.matrix.token}`,
			},
		};
		let ret = await this.request(call, null);
		if (ret.code != 200) throw `Server responded with ${ret.code}`;
		let state = JSON.parse(ret.body);
		return state;
	}

	async v3_members(room_id: RoomID, filter: string) {
		let opt = "";
		if (filter) {
			opt = `/${filter}`;
		}
		let call = {
			path: `/_matrix/client/v3/rooms/${room_id}/members${opt}`,
			hostname: this.config.matrix.hostname,
			port:     this.config.matrix.port,
			protocol: this.config.matrix.protocol,
			headers: {
				Authorization: `Bearer ${this.config.matrix.token}`,
			},
		};
		let ret = await this.request(call, null);
		if (ret.code != 200) throw `Server responded with ${ret.code}`;
		let state = JSON.parse(ret.body);
		return state;
	}

	async v3_put_state(room_id: RoomID, type: string, data: any) {
		let call = {
			method: "PUT",
			path: `/_matrix/client/v3/rooms/${room_id}/state/${type}`,
			hostname: this.config.matrix.hostname,
			port:     this.config.matrix.port,
			protocol: this.config.matrix.protocol,
			headers: {
				Authorization: `Bearer ${this.config.matrix.token}`,
			},
		};

		let body = JSON.stringify(data);
		let ret = await this.request(call, body);
		return JSON.parse(ret.body);
	}

	async v3_kick(room_id: RoomID, user_id: UserID, reason: string) {
		let call = {
			method: "POST",
			path: `/_matrix/client/v3/rooms/${room_id}/kick`,
			hostname: this.config.matrix.hostname,
			port:     this.config.matrix.port,
			protocol: this.config.matrix.protocol,
			headers: {
				Authorization: `Bearer ${this.config.matrix.token}`,
			},
		};

		let body = JSON.stringify({
			reason: reason,
			user_id: user_id,
		});

		let ret = await this.request(call, body);
		return JSON.parse(ret.body);
	}

	async v3_unban(room_id: RoomID, user_id: UserID, reason: string) {
		let call = {
			method: "POST",
			path: `/_matrix/client/v3/rooms/${room_id}/unban`,
			hostname: this.config.matrix.hostname,
			port:     this.config.matrix.port,
			protocol: this.config.matrix.protocol,
			headers: {
				Authorization: `Bearer ${this.config.matrix.token}`,
			},
		};

		let body = JSON.stringify({
			reason: reason,
			user_id: user_id,
		});

		let ret = await this.request(call, body);
		return JSON.parse(ret.body);
	}

	async v3_ban(room_id: RoomID, user_id: UserID, reason: string) {
		let call = {
			method: "POST",
			path: `/_matrix/client/v3/rooms/${room_id}/ban`,
			hostname: this.config.matrix.hostname,
			port:     this.config.matrix.port,
			protocol: this.config.matrix.protocol,
			headers: {
				Authorization: `Bearer ${this.config.matrix.token}`,
			},
		};

		let body = JSON.stringify({
			reason: reason,
			user_id: user_id,
		});

		let ret = await this.request(call, body);
		return JSON.parse(ret.body);
	}

	async v3_redact(room_id: RoomID, event_id: UserID, reason: string) {
		let txn = (this.txn++).toString();
		let call = {
			method: "PUT",
			path: `/_matrix/client/v3/rooms/${room_id}/redact/${event_id}/${txn}`,
			hostname: this.config.matrix.hostname,
			port:     this.config.matrix.port,
			protocol: this.config.matrix.protocol,
			headers: {
				Authorization: `Bearer ${this.config.matrix.token}`,
			},
		};

		let body = JSON.stringify({ reason: reason });
		let ret = await this.request(call, body);
		return JSON.parse(ret.body);
	}

	async v3_messages(room_id: RoomID, token: UserID, limit = 10) {
		let call = {
			path: `/_matrix/client/v3/rooms/${room_id}/messages?limit=${limit}&from=${token}`,
			hostname: this.config.matrix.hostname,
			port:     this.config.matrix.port,
			protocol: this.config.matrix.protocol,
			headers: {
				Authorization: `Bearer ${this.config.matrix.token}`,
			},
		};
		let ret = await this.request(call, null);
		if (ret.code != 200) throw `Server responded with ${ret.code}`;
		let context = JSON.parse(ret.body);
		return context;
	}

	async v3_sync() {
		let query = "";

		let timeout = 1000 * 60;

		if (this.sync_status.next) {
			query = `?since=${this.sync_status.next}&timeout=${timeout}`;
		}

		let call = {
			path: `/_matrix/client/v3/sync${query}`,
			hostname: this.config.matrix.hostname,
			port:     this.config.matrix.port,
			protocol: this.config.matrix.protocol,
			headers: {
				Authorization: `Bearer ${this.config.matrix.token}`,
			},
		};
		let ret: any;
		try {
			ret = await Util.request(call, null);
		} catch (err) {
			console.log(`Sync request failed, ${err}`);
			ret = { code: StatusCodes.SERVICE_UNAVAILABLE };
		}

		if (ret.code != StatusCodes.OK) {
			console.log(`Sync ${ret.code} ${Util.status_phrase(ret.code)}`);
			console.log(ret.body);
		}

		if (
			ret.code == StatusCodes.BAD_GATEWAY ||
			ret.code == StatusCodes.GATEWAY_TIMEOUT ||
			ret.code == StatusCodes.SERVICE_UNAVAILABLE ||
			ret.code == StatusCodes.TOO_MANY_REQUESTS ||
			ret.code == StatusCodes.REQUEST_TIMEOUT ||
			ret.code == 524 || /* Cloudflare something or other */
			ret.code == 520    /* Unknown error */
		) {
			/* Timeout and return, to try again */
			if (this.sync_status.timeout > 1000 * 60 * 10) {
				throw `Too many failed requests: ${ret.code} ${Util.status_phrase(ret.code)}`;
			}
			console.log(
				`Retrying after ${this.sync_status.timeout / 1000} seconds`,
			);
			await Util.sleep(this.sync_status.timeout);
			this.sync_status.timeout *= 2;
			return {};
		}

		/* TODO What on earth causes 409 CONFLICT in sync? Seems undocumented.
		 * Also resetting client state may not be necessary on 409, could be a 
		 * just be a transient error */
		if (ret.code == StatusCodes.BAD_REQUEST || 
			ret.code == StatusCodes.CONFLICT 
		) {
			/* Reset token and try again. If no token to reset, throw */

			if (this.sync_status.next) {
				this.sync_status.next = null;
				return {};
			}

			throw `Unrecoverable ${ret.code} ${Util.status_phrase(ret.code)}`;
		}

		if (ret.code != StatusCodes.OK) {
			throw `Unhandled ${ret.code} ${Util.status_phrase(ret.code)}`;
		}

		let data = JSON.parse(ret.body);
		this.sync_status.next = data.next_batch;

		this.sync_status.timeout = 4000;


		return data;
	}

	async request(options: any, body: any) {
		const first = new Date().getTime();
		const err_out = 5 * 60 * 1000;
		let retry = 0;

		let ret: any;

		while (true) {
			let now = new Date().getTime();
			if (now - first > err_out) {
				throw "Request failed after many retries";
			}

			if (retry) {
				console.log(`Retrying request after ${retry ** 2} seconds...`);
				await Util.sleep(retry ** 2 * 2000);
			}
			retry++;

			try {
				ret = await Util.request(options, body);
			} catch (err) {
				console.log(err);
				continue;
			}

			if (ret.code == StatusCodes.TOO_MANY_REQUESTS) {
				console.log(ret.body);
				await Util.sleep(ret.retry_after_ms);
			}
			if (
				ret.code == StatusCodes.TOO_MANY_REQUESTS ||
				ret.code == StatusCodes.REQUEST_TIMEOUT
			) {
				console.log(
					`Server responded with ${ret.code} ${Util.status_phrase(ret.code)}`,
				);
				continue;
			}

			let r = Math.floor(ret.code / 100);
			if (r == 4) {
				throw `Server responded with ${ret.code} ${Util.status_phrase(ret.code)}`;
			}

			if (r == 5) {
				console.log(
					`Server responded with ${ret.code} ${Util.status_phrase(ret.code)}`,
				);
				continue;
			}
			break;
		}
		return ret;
	}
}

export { MatrixAPI };
