"use strict";
import { MongoClient } from 'mongodb'

class Transaction {
	constructor(db) {
		this.db = db
	}
	
	async start(){
		this.session = this.db.client.startSession()
		await this.session.startTransaction()
		this.reset_cache()
	}

	reset_cache() {
		this.cache = {
			user: {}
		}
	}

	async user(id) {
		if (!this.cache.user[id]) {
			const query = {_id: id}
			let ret = await this.db.users.findOne(query, {session:this.session})
			if (ret) this.cache.user[id] = ret
		}
		return this.cache.user[id]
	}

	
	async abort() {
		await this.session.abortTransaction()
		await this.session.endSession()
	}

	/* Tries commit, returns true if it fails */
	async retry() {
		let promises = []
		for (let key in this.cache.user) {
			let user = this.cache.user[key]
			const query = {_id: user._id}
			promises.push(
				this.db.users.updateOne(query, {$set: user}, {upsert:true, session:this.session})
			)
		}

		await Promise.all(promises)

		try {
			await this.session.commitTransaction()
		} catch(error) {
			if (error.hasErrorLabel('TransientTransactionError')) {
				console.log(error)
				this.reset_cache()
				return true
			} else {
				console.log(error)
				throw error
			}
		}

		this.session.endSession()
		return false
	}
}

class Database {
	constructor(config) {
		this.client = new MongoClient(config.db);
		this.database = this.client.db("2023-06-16");
		this.events = this.database.collection("events");
		this.users = this.database.collection("users");
		this.meta  = this.database.collection("meta");
	}

	async wipe(){
		await this.database.dropDatabase()
		console.log("Database wiped")
	}

	async close(){
		await this.client.close()
	}
	
	/*
	 * Prefer the Transaction class over these functions!!!
	 * */

	async get_meta(name) {
		const query = {_id: name};
		let data = await this.meta.findOne(query)
		return data
	}

	async put_meta(meta) {
		const query = {_id: meta._id}
		const result = await this.meta.updateOne(query, {$set: meta}, {upsert:true});
	}

	async get_user(name) {
		const query = {_id: name};
		let data = await this.users.findOne(query)
		return data
	}

	async put_user(meta) {
		const query = {_id: meta._id}
		const result = await this.users.updateOne(query, {$set: meta}, {upsert:true});
	}


	async all_users(){
		let users = await this.users.find().toArray()
		return users
	}

	async get_event(room_id, event_id) {
		if (!room_id || !event_id) throw "Error: db.get_event requires two arguments."
		const query = {
			_id: room_id+event_id
		};

		let e = await this.events.findOne(query);
		return e
	}

	async new_event(e) {
		if (!e.room_id || !e.event_id) {
			throw "Malformed event"
		}
		
		e._id = e.room_id+e.event_id;
		const result = await this.events.insertOne(e);
	}
}



export {Database, Transaction}
