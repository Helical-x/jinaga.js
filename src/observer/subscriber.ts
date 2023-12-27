import { Network } from "../managers/NetworkManager";
import { Storage, FactEnvelope, FactReference } from "../storage";

export class Subscriber {
  private refCount: number = 0;
  private bookmark: string = "";
  private resolved: boolean = false;
  private disconnect: (() => void) | undefined;
  private timer: NodeJS.Timer | undefined;

  constructor(
    private readonly feed: string,
    private readonly network: Network,
    private readonly store: Storage,
    private readonly notifyFactsAdded: (envelopes: FactEnvelope[]) => Promise<void>
  ) {}

  addRef() {
    this.refCount++;
    return this.refCount === 1;
  }

  release() {
    this.refCount--;
    return this.refCount === 0;
  }

  async start(): Promise<void> {
    this.bookmark = await this.store.loadBookmark(this.feed);
    await new Promise<void>((resolve, reject) => {
      this.resolved = false;
      // Refresh the connection every 4 minutes.
      this.disconnect = this.connectToFeed(resolve, reject);
      this.timer = setInterval(() => {
        if (this.disconnect) {
          this.disconnect();
        }
        this.disconnect = this.connectToFeed(resolve, reject);
      }, 4 * 60 * 1000);
    });
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    if (this.disconnect) {
      this.disconnect();
      this.disconnect = undefined;
    }
  }

  private connectToFeed(resolve: (value: void | PromiseLike<void>) => void, reject: (reason?: any) => void) {
    return this.network.streamFeed(this.feed, this.bookmark, async (factReferences, nextBookmark) => {
      const knownFactReferences: FactReference[] = await this.store.whichExist(factReferences);
      const unknownFactReferences: FactReference[] = factReferences.filter(fr => !knownFactReferences.includes(fr));
      if (unknownFactReferences.length > 0) {
        const graph = await this.network.load(unknownFactReferences);
        await this.store.save(graph);
        await this.store.saveBookmark(this.feed, nextBookmark);
        this.bookmark = nextBookmark;
        await this.notifyFactsAdded(graph);
      }
      if (!this.resolved) {
        this.resolved = true;
        resolve();
      }
    }, err => {
      if (!this.resolved) {
        this.resolved = true;
        reject(err);
      }
    });
  }
}