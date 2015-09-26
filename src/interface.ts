import _ = require("lodash");

export enum Direction {
    Predecessor,
    Successor
}

enum Quantifier {
    Exists,
    NotExists
}

export class Step {
    construtor() {}

    public toDeclarativeString(): string {
        throw Error("Abstract");
    }
}

class ExistentialCondition extends Step {
    constructor(
        public quantifier: Quantifier,
        public steps: Array<Step>
    ) { super(); }
}

export class PropertyCondition extends Step {
    constructor(
        public name: string,
        public value: any
    ) { super(); }

    public toDeclarativeString(): string {
        return "F." + this.name + "=\"" + this.value + "\"";
    }
}

export class Join extends Step {
    constructor(
        public direction: Direction,
        public role: string
    ) { super(); }

    public toDeclarativeString(): string {
        return (this.direction === Direction.Predecessor ? "P." : "S.") + this.role;
    }
}

export class Query {
    constructor(
        public steps: Array<Step>
    ) {}

    public toDescriptiveString(): string {
        return _.map(this.steps, s => s.toDeclarativeString()).join(" ");
    }
}

function done(descriptive: string, index: number): boolean {
    return index === descriptive.length;
}

function lookahead(descriptive: string, index: number): string {
    if (descriptive.length <= index) {
        throw Error("Malformed descriptive string " + descriptive + " at " + index);
    }
    return descriptive.charAt(index);
}

function consume(descriptive: string, index: number, expected: string): number {
    if (lookahead(descriptive, index) !== expected) {
        throw Error("Malformed descriptive string " + descriptive + " at " + index);
    }
    return index + 1;
}

function identifier(descriptive: string, index: number): {id: string, index: number} {
    var id = "";
    while (
        !done(descriptive, index) &&
        lookahead(descriptive, index) !== " " &&
        lookahead(descriptive, index) !== "=") {

        var next = lookahead(descriptive, index);
        index = consume(descriptive, index, next);
        id = id + next;
    }
    return {id, index};
}

function quotedValue(descriptive: string, index: number): {value: string, index: number} {
    var value = "";
    index = consume(descriptive, index, "\"");
    while (lookahead(descriptive, index) !== "\"") {
        var next = lookahead(descriptive, index);
        index = consume(descriptive, index, next);
        value = value + next;
    }
    index = consume(descriptive, index, "\"");
    return {value, index};
}

export function fromDescriptiveString(descriptive: string, index: number = 0): Query {
    if (done(descriptive, index)) {
        return new Query([]);
    }

    var steps: Array<Step> = [];
    while (true) {
        var next = lookahead(descriptive, index);
        if (next === "P") {
            index = consume(descriptive, index, "P");
            index = consume(descriptive, index, ".");
            var {id, index} = identifier(descriptive, index);
            var join = new Join(Direction.Predecessor, id);
            steps.push(join);
        }
        else if (next === "S") {
            index = consume(descriptive, index, "S");
            index = consume(descriptive, index, ".");
            var {id, index} = identifier(descriptive, index);
            var join = new Join(Direction.Successor, id);
            steps.push(join);
        }
        else if (next === "F") {
            index = consume(descriptive, index, "F");
            index = consume(descriptive, index, ".");
            var {id, index} = identifier(descriptive, index);
            index = consume(descriptive, index, "=");
            var {value, index} = quotedValue(descriptive, index);
            var property = new PropertyCondition(id, value);
            steps.push(property);
        }
        else {
            throw Error("Malformed descriptive string " + descriptive + " at " + index);
        }

        if (done(descriptive, index)) {
            return new Query(steps);
        }
        index = consume(descriptive, index, " ");
    }
}

export function isPredecessor(value: any): boolean {
    if (typeof(value) !== "object")
        return false;

    if (value instanceof Date)
        return false;

    return true;
}

export function computeHash(fact: Object): number {
    if (!fact)
        return 0;

    var hash = _.sum(_.map(_.pairs(fact), computeMemberHash, this));
    return hash;
}

function computeMemberHash(pair: [any]): number {
    var name = pair[0];
    var value = pair[1];

    var valueHash = 0;
    switch (typeof(value)) {
        case "string":
            valueHash = computeStringHash(value);
            break;
        case "number":
            valueHash = value;
            break;
        case "object":
            if (value instanceof Date) {
                valueHash = (<Date>value).getTime();
            }
            else {
                valueHash = computeHash(value);
            }
            break;
        case "boolean":
            valueHash = value ? 1 : 0;
            break;
        default:
            throw new TypeError("Property " + name + " is a " + typeof(value));
    }

    var nameHash = computeStringHash(name);
    return (nameHash << 5) - nameHash + valueHash;
}

function computeStringHash(str: string): number {
    if (!str)
        return 0;

    var hash = 0;
    for (var index = 0; index < str.length; index++) {
        hash = (hash << 5) - hash + str.charCodeAt(index);
    }
    return hash;
}

export interface Coordinator {
    onSaved(fact: Object, source: any);
    send(fact: Object, source: any);
    onReceived(fact: Object, source: any);
    onError(err: string);
}

export interface StorageProvider {
    init(coordinator: Coordinator);
    save(fact: Object, source: any);
    executeQuery(
        start: Object,
        query: Query,
        result: (error: string, facts: Array<Object>) => void,
        thisArg: Object
    );
    sendAllFacts();
    push(fact: Object);
}

export interface NetworkProvider {
    init(coordinator: Coordinator);
    watch(start: Object, query: Query);
    fact(fact: Object);
}


export interface Proxy {
    has(name: string): Proxy;
}
