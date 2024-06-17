# Matrix room management bot 

This is a personal project which I've published as a demonstration of my more 
recent Javascript/TypeScript projects utilizing MongoBD. 

This is deployed to manage rooms I run on [Matrix](https://matrix.org),
which is a decentralized Slack/Discord-like messaging platform. 

This is not intended to be ran by anyone as-is, but can serve as an example on 
how to implement a Matrix bot without relying on the offical SDKs. This repository implements its own lightweight 
interface for [Matrix Client-Server HTTP API](https://spec.matrix.org/v1.9/client-server-api/), 
in the `matrix-api.mts` file. Not complete API coverage, but has full support for
v2 sync, history via context api, room state, and all the relevant APIs for moderating a room and its users. 
Notably, e2ee support is currently missing.

Since 2024-04-17 this project is being migrated to TypeScript.

## Commands and usage
See [docs/commands.md](./docs/commands.md)

## Database
The bot uses MongoDB to store a complete copy of room event timelines, and 
maintains statistics about participating users. 

The bot is able to fetch history to recover from downtime 
or truncated sync responses.


### Config
See [src/matrix.d.ts](./src/matrix.d.ts) for config format. Create a file that exports a suitable
object from `config/config.mts` (this file is .gitignored). 

### Adding bot to rooms
Since this project is under eternal development, the history is imported to 
local files first to avoid bombarding matrix servers when db inevitably needs 
to be rebuilt. 

First you must import room history with `extra/room-importer` to a folder 
`./history/<room>/*.json`. Room name does not matter. 
Preferably do this using an account that has access to the beginning of room 
history, eg the room's creator. 

Then add the room to the configuration file. Reset and rebuilt the 
database by setting `WIPE_DB=1` environment variable.

If you wish to retain user ban/mute etc status, run `export` from the bot's 
command line before db reset. Then run `import` once db has been rebuilt. 

### Image repost detection
The bot creates perceptual hashes of images posted to rooms where 
`phash:true`, which is then used for repost detection. The bot reacts with 
♻️  to pictures it deems are duplicates.

For phash library, a golang one is used due to a lack of any decent Node.js libraries.

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


