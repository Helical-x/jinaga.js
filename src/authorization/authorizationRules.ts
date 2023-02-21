import { getPredecessors } from '../memory/memory-store';
import { Query } from '../query/query';
import { Preposition } from '../query/query-parser';
import { Direction, Join, PropertyCondition, Step } from '../query/steps';
import { SpecificationOf } from '../specification/model';
import { Condition, Label, Match, PathCondition, Specification } from '../specification/specification';
import { FactRecord, FactReference, factReferenceEquals, ReferencesByName, Storage } from '../storage';
import { findIndex, flatten, flattenAsync, mapAsync } from '../util/fn';
import { Trace } from '../util/trace';

class Evidence {
    constructor(
        private factRecords: FactRecord[]
    ) { }

    query(start: FactReference, query: Query): FactReference[] {
        const results = this.executeQuery(start, query.steps);
        return results;
    }

    private executeQuery(start: FactReference, steps: Step[]) {
        return steps.reduce((facts, step) => {
            return this.executeStep(facts, step);
        }, [start]);
    }

    private executeStep(facts: FactReference[], step: Step): FactReference[] {
        if (step instanceof PropertyCondition) {
            if (step.name === 'type') {
                return facts.filter(fact => {
                    return fact.type === step.value;
                });
            }
        }
        else if (step instanceof Join) {
            if (step.direction === Direction.Predecessor) {
                return flatten(facts, fact => {
                    const record = this.findFact(fact);
                    return getPredecessors(record, step.role);
                });
            }
        }

        throw new Error('Defect in parsing authorization rule.');
    }

    executeSpecification(givenName: string, matches: Match[], label: string, fact: FactRecord): FactReference[] {
        const references: ReferencesByName = {
            [givenName]: {
                type: fact.type,
                hash: fact.hash
            }
        };
        const results = this.executeMatches(references, matches);
        return results.map(result => result[label]);
    }

    private executeMatches(references: ReferencesByName, matches: Match[]): ReferencesByName[] {
        const results = matches.reduce(
            (tuples, match) => tuples.flatMap(
                tuple => this.executeMatch(tuple, match)
            ),
            [references]
        );
        return results;
    }

    private executeMatch(references: ReferencesByName, match: Match): ReferencesByName[] {
        let results: ReferencesByName[] = [];
        if (match.conditions.length === 0) {
            throw new Error("A match must have at least one condition.");
        }
        const firstCondition = match.conditions[0];
        if (firstCondition.type === "path") {
            const result: FactReference[] = this.executePathCondition(references, match.unknown, firstCondition);
            results = result.map(reference => ({
                ...references,
                [match.unknown.name]: {
                    type: reference.type,
                    hash: reference.hash
                }
            }));
        }
        else {
            throw new Error("The first condition must be a path condition.");
        }

        const remainingConditions = match.conditions.slice(1);
        for (const condition of remainingConditions) {
            results = this.filterByCondition(references, match.unknown, results, condition);
        }
        return results;
    }

    private executePathCondition(references: ReferencesByName, unknown: Label, pathCondition: PathCondition): FactReference[] {
        if (!references.hasOwnProperty(pathCondition.labelRight)) {
            throw new Error(`The label ${pathCondition.labelRight} is not defined.`);
        }
        const start = references[pathCondition.labelRight];
        const predecessors = pathCondition.rolesRight.reduce(
            (set, role) => this.executePredecessorStep(set, role.name, role.predecessorType),
            [start]
        );
        if (pathCondition.rolesLeft.length > 0) {
            throw new Error('Cannot execute successor steps on evidence.');
        }
        return predecessors;
    }

    private executePredecessorStep(set: FactReference[], name: string, predecessorType: string): FactReference[] {
        return flatten(set, reference => {
            const record = this.findFact(reference);
            if (record === null) {
                throw new Error(`The fact ${reference.type}:${reference.hash} is not defined.`);
            }
            const predecessors = getPredecessors(record, name);
            return predecessors.filter(predecessor => predecessor.type === predecessorType);
        });
    }

    private filterByCondition(references: ReferencesByName, unknown: Label, results: ReferencesByName[], condition: Condition): ReferencesByName[] {
        if (condition.type === "path") {
            const otherResults = this.executePathCondition(references, unknown, condition);
            return results.filter(result => otherResults.some(factReferenceEquals(result[unknown.name])));
        }
        else if (condition.type === "existential") {
            var matchingReferences = results.filter(result => {
                const matches = this.executeMatches(result, condition.matches);
                return condition.exists ?
                    matches.length > 0 :
                    matches.length === 0;
            });
            return matchingReferences;
        }
        else {
            const _exhaustiveCheck: never = condition;
            throw new Error(`Unknown condition type: ${(condition as any).type}`);
        }
    }

    private findFact(reference: FactReference): FactRecord | null {
        return this.factRecords.find(factReferenceEquals(reference)) ?? null;
    }
}

function headStep(step: Step) {
    if (step instanceof PropertyCondition) {
        return step.name === 'type';
    }
    else if (step instanceof Join) {
        return step.direction === Direction.Predecessor;
    }
    else {
        return false;
    }
}

interface AuthorizationRule {
    isAuthorized(userFact: FactReference | null, fact: FactRecord, evidence: Evidence, store: Storage): Promise<boolean>;
}

class AuthorizationRuleAny implements AuthorizationRule {
    isAuthorized(userFact: FactReference | null, fact: FactRecord, evidence: Evidence, store: Storage) {
        return Promise.resolve(true);
    }
}

class AuthorizationRuleNone implements AuthorizationRule {
    isAuthorized(userFact: FactReference | null, fact: FactRecord, evidence: Evidence, store: Storage): Promise<boolean> {
        Trace.warn(`No fact of type ${fact.type} is authorized.`);
        return Promise.resolve(false);
    }
}

class AuthorizationRuleQuery implements AuthorizationRule {
    constructor(
        private head: Query,
        private tail: Query | null
    ) {

    }

    async isAuthorized(userFact: FactReference | null, fact: FactRecord, evidence: Evidence, store: Storage) {
        if (!userFact) {
            Trace.warn(`No user is logged in while attempting to authorize ${fact.type}.`);
            return false;
        }
        const predecessors = evidence.query(fact, this.head);
        const results = await flattenAsync(predecessors, async p =>
            await this.executeQuery(store, p));
        const authorized = results.some(factReferenceEquals(userFact));
        if (!authorized) {
            if (results.length === 0) {
                Trace.warn(`The authorization rule for ${fact.type} returned no authorized users.`);
            }
            else {
                const count = results.length === 1 ? '1 user' : `${results.length} users`;
                Trace.warn(`The authorization rule for ${fact.type} returned ${count}, but not the logged in user.`);
            }
        }
        return authorized;
    }

    private async executeQuery(store: Storage, predecessors: FactReference) {
        if (!this.tail) {
            return [ predecessors ];
        }
        const results = await store.query(predecessors, this.tail);
        return results
            .map(path => path[path.length-1]);
    }
}

function seeksSuccessors(match: Match): boolean {
    return match.conditions.some(condition =>
        (condition.type === 'path' && condition.rolesLeft.length > 0) ||
        (condition.type === 'existential' && condition.matches.some(seeksSuccessors))
    );
}

class AuthorizationRuleSpecification implements AuthorizationRule {
    constructor(
        private specification: Specification
    ) { }

    async isAuthorized(userFact: FactReference | null, fact: FactRecord, evidence: Evidence, store: Storage): Promise<boolean> {
        if (!userFact) {
            Trace.warn(`No user is logged in while attempting to authorize ${fact.type}.`);
            return false;
        }

        // The specification must be given a single fact.
        if (this.specification.given.length !== 1) {
            throw new Error('The specification must be given a single fact.');
        }

        // The projection must be a singular label.
        if (this.specification.projection.type !== 'fact') {
            throw new Error('The projection must be a singular label.');
        }
        const label = this.specification.projection.label;

        // Find the first match (if any) that seeks successors.
        const firstSuccessorMatch = findIndex(this.specification.matches, seeksSuccessors);

        // If there is no such match, then execute the rule based solely on the evidence.
        if (firstSuccessorMatch === -1) {
            const results = evidence.executeSpecification(
                this.specification.given[0].name,
                this.specification.matches,
                label,
                fact);
            const authorized = results.some(factReferenceEquals(userFact));
            return authorized;
        }

        throw new Error('Not implemented.');
    }
}

export class AuthorizationRules {
    private rulesByType: {[type: string]: AuthorizationRule[]} = {};

    with(rules: (r: AuthorizationRules) => AuthorizationRules) {
        return rules(this);
    }

    no(type: string) {
        return this.withRule(type, new AuthorizationRuleNone());
    }

    any(type: string) {
        return this.withRule(type, new AuthorizationRuleAny());
    }

    type<T, U>(type: string, preposition: Preposition<T, U>): AuthorizationRules;
    type<T, U>(type: string, specification: SpecificationOf<[T], U>): AuthorizationRules;
    type<T, U>(type: string, prepositionOrSpecification: Preposition<T, U> | SpecificationOf<[T], U>): AuthorizationRules {
        if (prepositionOrSpecification instanceof Preposition) {
            return this.oldType(type, prepositionOrSpecification);
        }
        else {
            return this.newType(type, prepositionOrSpecification);
        }
    }

    private oldType<T, U>(type: string, preposition: Preposition<T, U>): AuthorizationRules {
        if (preposition.steps.length === 0) {
            throw new Error(`Invalid authorization rule for type ${type}: the query matches the fact itself.`);
        }
        const first = preposition.steps[0];
        if (!(first instanceof Join)) {
            throw new Error(`Invalid authorization rule for type ${type}: the query does not begin with a predecessor.`);
        }
        if (first.direction !== Direction.Predecessor) {
            throw new Error(`Invalid authorization rule for type ${type}: the query expects successors.`);
        }

        const index = findIndex(preposition.steps, step => !headStep(step));
        const head = index < 0 ? new Query(preposition.steps) : new Query(preposition.steps.slice(0, index));
        const tail = index < 0 ? null : new Query(preposition.steps.slice(index));
        return this.withRule(type, new AuthorizationRuleQuery(head, tail));
    }

    private newType<T, U>(type: string, specification: SpecificationOf<[T], U>): AuthorizationRules {
        return this.withRule(type, new AuthorizationRuleSpecification(specification.specification));
    }

    private withRule(type: string, rule: AuthorizationRule) {
        const oldRules = this.rulesByType[type] || [];
        const newRules = [...oldRules, rule];
        const newRulesByType = { ...this.rulesByType, [type]: newRules };
        const result = new AuthorizationRules();
        result.rulesByType = newRulesByType;
        return result;
    }

    hasRule(type: string) {
        return !!this.rulesByType[type];
    }

    async isAuthorized(userFact: FactReference | null, fact: FactRecord, factRecords: FactRecord[], store: Storage) {
        const rules = this.rulesByType[fact.type];
        if (!rules) {
            return false;
        }

        const evidence = new Evidence(factRecords);
        const results = await mapAsync(rules, async r =>
            await r.isAuthorized(userFact, fact, evidence, store));
        return results.some(b => b);
    }
}
