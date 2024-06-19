import https from "https";
import http from "http";
import { getReasonPhrase } from "http-status-codes";
import { isNumber } from "util";

function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function statusPhrase(code: number) {
	let reason = "";
	try {
		reason = getReasonPhrase(code);
	} catch (err) {
		reason = "Unknown status code";
	}
	return reason;
}

function request(options: any, body: any) {
	let lib:any = https;

	if (options.protocol === "http:")
		lib = http;

	return new Promise(function (resolve, reject) {
		let req = lib.request(options, (r) => {
			let data = "";
			r.setEncoding("utf8");
			r.on("data", (chunk) => {
				data += chunk;
			});
			r.on("end", () => {
				resolve({ response: r, body: data, code: r.statusCode });
			});
		});
		req.on("error", (err) => {
			console.log(err);
			reject(err);
		});
		req.end(body);
	});
}

function format_time(ms: number) {
	if (ms < 1000) {
		return `${ms}ms`;
	}

	let sec = Math.floor(ms / 1000);

	if (sec <= 60) {
		return `${sec}s`;
	}

	let min = Math.floor(sec / 60);

	if (min <= 60) {
		return `${min}m ${sec % 60}s`;
	}

	let hour = Math.floor(min / 60);

	if (hour <= 24) {
		return `${hour}h ${min % 60}m`;
	}

	let day = Math.floor(hour / 24);

	if (day <= 30) {
		return `${day}d ${hour % 24}h`;
	}

	let month = Math.floor(day / 30);

	if (month <= 12) {
		return `${month}M ${day % 30}d`;
	}

	let year = Math.floor(month / 12);

	return `${year}Y ${month % 12}M`;
}


function parse_time(time:string):number {

	enum State {
		num,
		str,
		parse,
	};

	time += "\0";

	let state:State = State.num;

	let ts = 0;

	let buffer_num = "";
	let buffer_str = "";

	for (let i = 0; i < time.length; i++) {
		let c = time[i];

		if (c == "\0") state = State.parse;

		if (state == State.num) {
			if (c >= '0' && c <= '9') {
				buffer_num += c;
				continue;
			} else {
				state = State.str;
			}
		}

		if (state == State.str) {
			if (c >= '0' && c <= '9') {
				state = State.parse,
				i--;
				continue;
			} else {
				buffer_str += c;
				continue;
			}
		}
		
		if (state == State.parse) {
			let num = parseInt(buffer_num);
			if (!Number.isInteger(num)) {
				throw `${buffer_num} is not a number`;
			}
			switch (buffer_str) {
			case "d":
			case "day":
			case "days":
				num *= 24;
				/* fallthrough */
			case "h":
			case "hour":
				num *= 60;
				/* fallthrough */
			case "min":
				num *= 60;
				/* fallthrough */
			case "s":
			case "sec":
				num *= 1000;
				/* fallthrough */
			case "ms":
				break;
			default:
				throw `${buffer_num}${buffer_str} is not a valid unit of time`;
			}
			ts += num;

			buffer_num = "";
			buffer_str = "";
			state = State.num;
			i--;
		}

		if (c == "\0") break;
	}

	if (buffer_num != "" || buffer_str != "") {
		throw `Dangling symbols ${buffer_num}${buffer_str}`;
	}

	return ts;
}


let Util = {
	sleep: sleep,
	request: request,
	format_time: format_time,
	parse_time: parse_time,
	status_phrase: statusPhrase,
};

export { Util };
