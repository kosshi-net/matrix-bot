# Matrix room management bot 

This is a personal project which I've published as a demonstration of my more 
recent Javascript/Node.JS projects utilizing MongoBD. 

This is deployed to manage rooms I run on [Matrix](https://matrix.org),
which is a decentralized Slack/Discord-like messaging platform. 

This is not intended to be ran by anyone as-is, but can serve as an example on 
how to implement a Matrix bot without relying on the offical SDKs. This repository implements its own lightweight 
interface for [Matrix Client-Server HTTP API](https://spec.matrix.org/v1.9/client-server-api/), 
in the `matrix-api.mjs` file. Not complete API coverage, but has full support for
v2 sync, history via context api, room state, and all the relevant APIs for moderating a room and its users. 
Notably, e2ee support is currently missing.

## Database
The bot uses MongoDB to store a complete copy of room event timelines, and 
maintains statistics about participating users.

The bot is able to fetch history to recover from downtime 
or truncated sync responses.


## Config

Below is an example `config.json`. The real one is .gitignored

```json
{
	"userId"      : "@bot:matrix.org",
	"accessToken" : "syt_REDACTED",

	"baseUrl"     : "https://matrix.org",
	"hostname"    : "matrix.org",

	"owner_id"     : "@admin:example.org",

	"db"          : "mongodb://localhost:27017/",

	"alert_room":"!alerts:example.org",

	"rooms": {

		"!roomid1:example.org": {
			"manage": true,
			"word_filter": false,
			"trusted_only": true 
		},

		"!roomid2:example.org": {
			"manage": true,
			"word_filter": true,
			"trusted_only": false
		},

	},
	

	"trust_domains": {
		"example.org": true
	},


	"word_filter": [
		"censorme"
	],

	"letter_alias": [
		["ä", "a"],
		["ö", "o"],
		["а", "a"],
		["о", "o"]
	]
}


```

### Commands
Defined in `main.js`

### User trust
The bot uses gathered statistics to determine the "trust level" of users. This 
trust is used to limit access to "trusted only" rooms. 

Completely new users don't have write permissions even in untrusted rooms, this 
is to implement a type of 
[knocking](https://spec.matrix.org/v1.5/client-server-api/#mroomjoin_rules) 
feature, which still gives read access and works for rooms below Version 7. 
The "owner" of the bot is alerted about newly joined users.


## License
MIT




