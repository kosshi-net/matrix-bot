import https from "https";
import http from "http";
import { getReasonPhrase } from "http-status-codes";

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

let Util = {
	sleep: sleep,
	request: request,
	format_time: format_time,
	status_phrase: statusPhrase,
};

export { Util };
