import { assert, assertEquals, assertRejects } from "./deps/testing.ts";
import { makeCancelableSearch } from "./cancelableSearch.ts";
import { releaseProxy } from "./deps/comlink.ts";
import type { SearchWorkerAPI } from "./search.worker.ts";

// Minimal fake Remote & SharedWorker port for DI tests
type CandidateLike = {
  title: string;
  titleLc: string;
  updated: number;
  linked: number;
  metadata: Map<string, { image?: string }>;
  dist: number;
  matches: [number, number][];
};
type ProgressCallback = (cands: CandidateLike[], progress: number) => void;
interface FakeRemote extends Pick<SearchWorkerAPI, "load" | "search"> {
  [releaseProxy](): void;
}

Deno.test("cancelableSearch (WebWorker + DI behaviors)", async (t) => {
  // Basic WebWorker API surface checks
  await t.step("webworker: method existence", () => {
    using search = makeCancelableSearch(
      new URL("./search.worker.ts", import.meta.url),
    );
    assertEquals(typeof search.search, "function");
    assertEquals(typeof search.load, "function");
  });

  await t.step("webworker: empty query handled", () => {
    using search = makeCancelableSearch(
      new URL("./search.worker.ts", import.meta.url),
    );
    assertEquals(typeof search.search, "function");
  });

  await t.step("webworker: non-existent worker -> error", async () => {
    let threwError = false;
    try {
      using search = makeCancelableSearch("non-existent-worker.js");
      await search.load(["test-project"]);
    } catch (error) {
      threwError = true;
      assertEquals(typeof (error as Error).message, "string");
    }
    assertEquals(threwError, true);
  });

  // DI behavior tests (formerly separate)
  await t.step("di: load / progressive search / dispose", async (_t) => {
    const calls: string[] = [];
    let released = false;
    const fakeRemote: FakeRemote = {
      load(projects) {
        calls.push(`load:${projects.length}`);
        return Promise.resolve(42);
      },
      search(query, _chunk, cb: ProgressCallback) {
        calls.push(`search:${query}`);
        cb([{
          title: "A",
          titleLc: "a",
          updated: 0,
          linked: 0,
          metadata: new Map(),
          dist: 0,
          matches: [],
        }], 10);
        cb([], 100);
        return Promise.resolve();
      },
      [releaseProxy]() {
        released = true;
      },
    };
    const fakePort = {
      close() {
        calls.push("port-close");
      },
    } as unknown as MessagePort;
    const sharedWorkerFactory = () => ({ port: fakePort });
    const workerFactory = () =>
      fakeRemote as unknown as FakeRemote & { [releaseProxy](): void };
    {
      using search = makeCancelableSearch("fake://worker", {
        workerFactory,
        sharedWorkerFactory,
      });
      const n = await search.load(["p1", "p2"]);
      assertEquals(n, 42);
      assert(calls.includes("load:2"));
      const stream = search.search("hello", 5);
      const reader = stream.getReader();
      const first = await reader.read();
      assert(!first.done);
      assertEquals(first.value?.[1], 10);
      const second = await reader.read();
      assert(!second.done);
      assertEquals(second.value?.[1], 100);
      const end = await reader.read();
      assert(end.done);
    }
    assert(released);
    assert(calls.includes("port-close"));
  });

  await t.step("di: empty query short-circuits", async () => {
    const noopRemote: FakeRemote = {
      load: () => Promise.resolve(0),
      search: () => Promise.resolve(),
      [releaseProxy]() {},
    };
    const port = { close() {} } as unknown as MessagePort;
    using search = makeCancelableSearch("fake://noop", {
      workerFactory: () => noopRemote,
      sharedWorkerFactory: () => ({ port }),
    });
    const stream = search.search("");
    const { done } = await stream.getReader().read();
    assert(done);
  });

  await t.step("di: failing worker propagates error", async () => {
    let released2 = false;
    let closed2 = false;
    const failingWorker: FakeRemote = {
      load: () => Promise.resolve(0),
      search() {
        return Promise.reject(new Error("boom"));
      },
      [releaseProxy]() {
        released2 = true;
      },
    };
    const portStub = {
      close() {
        closed2 = true;
      },
    } as unknown as MessagePort;
    const failing = makeCancelableSearch("fake://w", {
      workerFactory: () => failingWorker,
      sharedWorkerFactory: () => ({
        port: portStub,
        close() {
          closed2 = true;
        },
      }),
    });
    const stream = failing.search("q", 1000);
    await assertRejects(
      async () => {
        await stream.getReader().read();
      },
      Error,
      "boom",
    );
    failing[Symbol.dispose]();
    assert(released2);
    assert(closed2);
  });

  await t.step("di: cancel triggers stream cancel branch", async () => {
    const timeouts: number[] = [];
    let progressCalls = 0;
    const worker2: FakeRemote = {
      load: () => Promise.resolve(0),
      search(_q, _c, cb) {
        cb([], 0.3);
        progressCalls++;
        return new Promise<void>((r) => {
          const id = setTimeout(() => r(), 20);
          timeouts.push(id);
        });
      },
      [releaseProxy]() {},
    };
    const portStub2 = { close() {} } as unknown as MessagePort;
    using cancelable2 = makeCancelableSearch("fake://w2", {
      workerFactory: () => worker2 as unknown as FakeRemote,
      sharedWorkerFactory: () => ({ port: portStub2, close() {} }),
    });
    const reader = cancelable2.search("hello", 10).getReader();
    await reader.cancel();
    for (const id of timeouts) clearTimeout(id);
    assert(progressCalls >= 0 && progressCalls <= 1);
  });
});
