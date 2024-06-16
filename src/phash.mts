import {execFile} from "node:child_process";

import hdist from 'hamming-distance';

const bin = "phash/phash";

async function hash(path:string):Promise<string> {
	return new Promise((resolve, reject) => {
		execFile(bin, [path], (err, stdout)=>{
			if (err)
				reject(err);
			else
				resolve(stdout);
		});
	});
}

function compare(a:string, b:string):number {
	return hdist( Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

function compare_buffer(a:Buffer, b:Buffer):number {
	return hdist(a, b);
}

let phash = {
	hash:hash,
	compare:compare,
	compare_buffer:compare_buffer
};

export {phash};
