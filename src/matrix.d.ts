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

