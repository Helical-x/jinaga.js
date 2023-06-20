import { Query } from '../query/query';
import { Feed } from "../specification/feed";
import { Specification } from "../specification/specification";
import { FactFeed, FactRecord, FactReference, ProjectedResult, Storage } from '../storage';
import { UserIdentity } from "../user-identity";
import { Authorization } from './authorization';
import { Forbidden } from './authorization-engine';

export class AuthorizationNoOp implements Authorization {
    constructor(
        private store: Storage
    ) { }

    getOrCreateUserFact(userIdentity: UserIdentity): Promise<FactRecord> {
        throw new Forbidden();
    }

    query(userIdentity: UserIdentity, start: FactReference, query: Query): Promise<any[]> {
        return this.store.query(start, query);
    }

    read(userIdentity: UserIdentity, start: FactReference[], specification: Specification): Promise<ProjectedResult[]> {
        return this.store.read(start, specification);
    }

    load(userIdentity: UserIdentity, references: FactReference[]): Promise<FactRecord[]> {
        return this.store.load(references);
    }

    feed(userIdentity: UserIdentity, feed: Feed, start: FactReference[], bookmark: string): Promise<FactFeed> {
        return this.store.feed(feed, start, bookmark);
    }

    async save(userIdentity: UserIdentity, facts: FactRecord[]): Promise<FactRecord[]> {
        const envelopes = await this.store.save(facts.map(fact => ({
            fact,
            signatures: []
        })));
        return envelopes.map(envelope => envelope.fact);
    }

    verifyDistribution(userIdentity: UserIdentity, feeds: Feed[], start: FactReference[]): Promise<void> {
        return Promise.resolve();
    }
}