/*
 * Matrix IDs:
 * User ID    : @user:domain.org
 * Room Alias : #room:domain.org
 * Room ID    : !1234ASDFGH:domain.org
 *
 */

/* May sometimes be a macro, not a valid ID!!! Implement a special type? */
type UserID    = `@${string}`; 

/* Strict, must always be a valid room id */
type RoomID    = `!${string}`; 

/* Alias can either be a room id, alias, or a room macro */
type RoomAlias = `${'!'|'#'}${string}`;


/* Config type */

interface BotConfig {
	matrix: {
		token:    string,
		hostname: string,
		port: number,
		protocol: "https:" | "http:",
	}

	db_url:   string,
	owner_id: UserID,
	alert_room: string,

	trust_domains: { [index:string]: boolean },

	rooms: { [index:RoomID]: {
		label:        string,
		manage:       boolean,
		word_filter:  boolean,
		trusted_only: boolean,
		phash:        boolean,
	} }

	gatekeep_kick_message: string,
	gatekeep_mute_message: string,

	word_filter: Array<string>,

	letter_alias: Array<Array<string>>,
}
