import fs from 'node:fs/promises'
import https from "https"

const ROOM="!:matrix.com"
const TOKEN="syt_" 
const HOSTNAME="matrix.org"


function request(options){
	return new Promise(function(resolve, reject){
		let req = https.request(options, (r)=>{
			let data = "";
			r.setEncoding("utf8")
			r.on('data', chunk=>{ data += chunk })
			r.on('end', ()=>{
				resolve(
					{response:r, body:data, code:r.statusCode}
				)
			})
		})
		req.on('error', (err)=>{
			console.log(err)
			reject(err)
		})
		req.end()
	})
}

async function main() {
	let since="s0_0_0_0_0_0_0_0_0_0"
	while(true) {
		let url = {
			hostname: HOSTNAME,
			path: `/_matrix/client/v3/rooms/${ROOM}/messages?limit=500&from=${since}`,
			headers: {
				Authorization: `Bearer ${TOKEN}`
			},
		}

		console.log(`Request ${since}`)
		let res = await request(url)

		if (res.code != 200) {
			console.log(res)
			throw `Code ${res.code}`
		}

		await fs.writeFile(`history/${since}.json`, res.body)

		let events = JSON.parse(res.body)
		let next = events.end
		
		console.log(`Received. Next: ${next}`)
		if (!next) {
			console.log(res)
			throw "No next"
		}
		since = next
	}
}

main()
