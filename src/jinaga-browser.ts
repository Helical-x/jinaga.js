import { Authentication } from "./authentication/authentication";
import { AuthenticationNoOp } from "./authentication/authentication-noop";
import { AuthenticationOffline } from "./authentication/authentication-offline";
import { AuthenticationWebClient } from "./authentication/authentication-web-client";
import { Fork } from "./fork/fork";
import { PassThroughFork } from "./fork/pass-through-fork";
import { PersistentFork } from "./fork/persistent-fork";
import { TransientFork } from "./fork/transient-fork";
import { HttpNetwork } from "./http/httpNetwork";
import { SyncStatusNotifier, WebClient } from "./http/web-client";
import { XhrConnection } from "./http/xhr";
import { IndexedDBLoginStore } from "./indexeddb/indexeddb-login-store";
import { IndexedDBQueue } from "./indexeddb/indexeddb-queue";
import { IndexedDBStore } from "./indexeddb/indexeddb-store";
import { Jinaga } from "./jinaga";
import { FactManager } from "./managers/factManager";
import { Network, NetworkNoOp } from "./managers/NetworkManager";
import { MemoryStore } from "./memory/memory-store";
import { ObservableSource } from "./observable/observable";
import { Storage } from "./storage";

export type JinagaBrowserConfig = {
    httpEndpoint?: string,
    wsEndpoint?: string,
    indexedDb?: string,
    httpTimeoutSeconds?: number
}

export class JinagaBrowser {
    static create(config: JinagaBrowserConfig) {
        const store = createStore(config);
        const observableSource = new ObservableSource(store);
        const syncStatusNotifier = new SyncStatusNotifier();
        const fork = createFork(config, store, syncStatusNotifier);
        const authentication = createAuthentication(config, syncStatusNotifier);
        const network = createNetwork(config, syncStatusNotifier);
        const factManager = new FactManager(authentication, fork, observableSource, store, network);
        return new Jinaga(factManager, syncStatusNotifier);
    }
}

function createStore(config: JinagaBrowserConfig): Storage {
  if (config.indexedDb) {
    return new IndexedDBStore(config.indexedDb);
  }
  else {
    return new MemoryStore();
  }
}

function createFork(
    config: JinagaBrowserConfig,
    store: Storage,
    syncStatusNotifier: SyncStatusNotifier
): Fork {
    if (config.httpEndpoint) {
        const httpConnection = new XhrConnection(config.httpEndpoint);
        const httpTimeoutSeconds = config.httpTimeoutSeconds || 5;
        const webClient = new WebClient(httpConnection, syncStatusNotifier, {
            timeoutSeconds: httpTimeoutSeconds
        });
        if (config.indexedDb) {
            const queue = new IndexedDBQueue(config.indexedDb);
            const fork = new PersistentFork(store, queue, webClient);
            fork.initialize();
            return fork;
        }
        else {
            const fork = new TransientFork(store, webClient);
            return fork;
        }
    }
    else {
        const fork = new PassThroughFork(store);
        return fork;
    }
}

function createAuthentication(
    config: JinagaBrowserConfig,
    syncStatusNotifier: SyncStatusNotifier
): Authentication {
    if (config.httpEndpoint) {
        const httpConnection = new XhrConnection(config.httpEndpoint);
        const httpTimeoutSeconds = config.httpTimeoutSeconds || 5;
        const webClient = new WebClient(httpConnection, syncStatusNotifier, {
            timeoutSeconds: httpTimeoutSeconds
        });
        if (config.indexedDb) {
            const loginStore = new IndexedDBLoginStore(config.indexedDb);
            const authentication = new AuthenticationOffline(loginStore, webClient);
            return authentication;
        }
        else {
            const authentication = new AuthenticationWebClient(webClient);
            return authentication;
        }
    }
    else {
        const authentication = new AuthenticationNoOp();
        return authentication;
    }
}

function createNetwork(
    config: JinagaBrowserConfig,
    syncStatusNotifier: SyncStatusNotifier
): Network {
    if (config.httpEndpoint) {
        const httpConnection = new XhrConnection(config.httpEndpoint);
        const httpTimeoutSeconds = config.httpTimeoutSeconds || 5;
        const webClient = new WebClient(httpConnection, syncStatusNotifier, {
            timeoutSeconds: httpTimeoutSeconds
        });
        const network = new HttpNetwork(webClient);
        return network;
    }
    else {
        return new NetworkNoOp();
    }
}