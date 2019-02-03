import { Query } from './query/query';
import { FactEnvelope, FactReference, Storage } from './storage';

export class Cache implements Storage {
    constructor(private inner: Storage) {

    }

    save(envelopes: FactEnvelope[]) {
        return this.inner.save(envelopes);
    }

    query(start: FactReference, query: Query) {
        return this.inner.query(start, query);
    }

    exists(fact: FactReference): Promise<boolean> {
        return this.inner.exists(fact);
    }

    load(references: FactReference[]) {
        return this.inner.load(references);
    }
}