// @ts-check
"use strict";

function is_whitespace(input) {
	return !input || !input.trim();
}

const Chartype = {
	Char: "Char",
	Whitespace: "Whitespace",
	Quote: "Quote",
	QuoteDouble: "QuoteDouble",
};

class StringParser {
	constructor(str) {
		this.str = str.trim();
		this.index = 0;
		if (this.str[this.index] == "\\") this.index++;
	}

	type_is_quote(type) {
		switch (type) {
			case Chartype.Quote:
			case Chartype.QuoteDouble:
				return true;
				defaut: return false;
		}
	}

	type() {
		let c = this.str[this.index];
		if (this.index > 0 && this.str[this.index - 1] == "\\")
			return Chartype.Char;
		switch (c) {
			case '"':
				return Chartype.QuoteDouble;
			case "'":
				return Chartype.Quote;
			case undefined:
				return Chartype.Whitespace;
			default:
				if (is_whitespace(c)) return Chartype.Whitespace;
				return Chartype.Char;
		}
	}

	cur() {
		return this.str[this.index];
	}

	next() {
		this.index++;
		if (this.str[this.index] == "\\") this.index++;
		if (this.index > this.str.length + 1)
			throw "Syntax Error (Out of bounds)";
		return this.cur();
	}

	word() {
		let c1 = this.cur();
		let t1 = this.type();

		if (c1 == undefined) return undefined;

		if (t1 === Chartype.Whitespace) {
			while (this.type() === Chartype.Whitespace) this.next();
		}
		if (c1 == undefined) return undefined;

		c1 = this.cur();
		t1 = this.type();
		let buffer = "";
		if (t1 == Chartype.Char) {
			buffer += c1;
			t1 = Chartype.Whitespace;
		}

		while (true) {
			let c = this.next();
			let t = this.type();

			if (t == t1) {
				this.next();
				break;
			}

			buffer += c;
		}
		return buffer;
		//console.log("Word buffer: ["+buffer+"]")
	}
}

function parse_command(str) {
	let argv = [];
	try {
		let parser = new StringParser(str);

		let word;
		while ((word = parser.word())) argv.push(word);

		return argv;
	} catch (e) {
		console.log(e);
		return [];
	}
}

export { parse_command };
