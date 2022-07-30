import { Authentication } from "../../src/authentication/authentication";
import { Feed, Observable } from "../../src/feed/feed";
import { FeedImpl } from "../../src/feed/feed-impl";
import { Channel } from "../../src/fork/channel";
import { LoginResponse } from "../../src/http/messages";
import { Query } from "../../src/query/query";
import { Specification } from "../../src/specification/specification";
import { FactEnvelope, FactRecord, FactReference, Storage } from "../../src/storage";

export class MockAuthentication implements Authentication {
  private inner: Feed;

  constructor(
      storage: Storage
  ) {
      this.inner = new FeedImpl(storage);
  }

  async close(): Promise<void> {
      return this.inner.close();
  }
  login(): Promise<LoginResponse> {
      throw new Error("Method not implemented: login.");
  }
  local(): Promise<FactRecord> {
      throw new Error("Method not implemented: local.");
  }
  from(fact: FactReference, query: Query): Observable {
      return this.inner.from(fact, query);
  }
  save(envelopes: FactEnvelope[]): Promise<FactEnvelope[]> {
      return this.inner.save(envelopes);
  }
  query(start: FactReference, query: Query): Promise<FactReference[][]> {
      return this.inner.query(start, query);
  }
  read(start: FactReference[], specification: Specification): Promise<any[]> {
      return this.inner.read(start, specification);
  }
  whichExist(references: FactReference[]): Promise<FactReference[]> {
    throw new Error("WhichExist method not implemented on MockAuthentication.");
  }
  load(references: FactReference[]): Promise<FactRecord[]> {
      return this.inner.load(references);
  }
  addChannel(fact: FactReference, query: Query): Channel {
    throw new Error("AddChannel method not implemented on MockAuthentication.");
  }
  removeChannel(channel: Channel): void {
    throw new Error("RemoveChannel method not implemented on MockAuthentication.");
  }
}
