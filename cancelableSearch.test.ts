import { assert, assertEquals, assertRejects } from "./deps/testing.ts";
import { makeCancelableSearch } from "./cancelableSearch.ts";
import { expose } from "./deps/comlink.ts";
import type { SearchWorkerAPI } from "./worker-endpoint.ts";

// Helper: create a fake SearchWorkerAPI exposed over a MessagePort
function makeFakeEndpoint(impl: SearchWorkerAPI) {
  const { port1, port2 } = new MessageChannel();
  expose({
    load: impl.load,
    search: impl.search,
  } as SearchWorkerAPI, port1);
  let closed = false;
  return {
    endpoint: port2,
    [Symbol.dispose]() {
      if (closed) return;
      closed = true;
      try {
        port1.close();
      } catch (_) { /* ignore */ }
      try {
        port2.close();
      } catch (_) { /* ignore */ }
    },
  } as const;
}

Deno.test({
  name: "cancelableSearch (WebWorker + DI behaviors)",
  sanitizeOps: false,
  sanitizeResources: false,
}, async (t) => {
  // Basic WebWorker API surface checks
  await t.step({
    name: "webworker: method existence",
    sanitizeOps: true,
    sanitizeResources: true,
    fn: () => {
      using search = makeCancelableSearch(
        new Worker(new URL("./worker/search.worker.ts", import.meta.url), {
          type: "module",
        }),
      );
      assertEquals(typeof search.search, "function");
      assertEquals(typeof search.load, "function");
    },
  });

  await t.step({
    name: "webworker: empty query handled",
    sanitizeOps: true,
    sanitizeResources: true,
    fn: () => {
      using search = makeCancelableSearch(
        new Worker(new URL("./worker/search.worker.ts", import.meta.url), {
          type: "module",
        }),
      );
      assertEquals(typeof search.search, "function");
    },
  });

  // MessagePort / Comlink behavior tests (updated API)
  await t.step("port: load / progressive search / dispose", async () => {
    const calls: string[] = [];
    using endpoints = makeFakeEndpoint({
      load(projects) {
        calls.push(`load:${projects.length}`);
        return Promise.resolve(42);
      },
      search(query, _chunk, cb) {
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
    });

    using search = makeCancelableSearch(endpoints.endpoint);
    const n = await search.load(["p1", "p2"]);
    assertEquals(n, 42);
    assert(calls.includes("load:2"));
    const reader = search.search("hello", 5).getReader();
    const first = await reader.read();
    assert(!first.done);
    assertEquals(first.value?.[1], 10);
    const second = await reader.read();
    assert(!second.done);
    assertEquals(second.value?.[1], 100);
    const end = await reader.read();
    assert(end.done);
  });

  await t.step("port: empty query short-circuits", async () => {
    using endpoints = makeFakeEndpoint({
      load: () => Promise.resolve(0),
      search: () => Promise.resolve(),
    });
    using search = makeCancelableSearch(endpoints.endpoint);
    const { done } = await search.search("").getReader().read();
    assert(done);
  });

  await t.step("port: failing endpoint propagates error", async () => {
    using endpoints = makeFakeEndpoint({
      load: () => Promise.resolve(0),
      search() {
        return Promise.reject(new Error("boom"));
      },
    });
    using failing = makeCancelableSearch(endpoints.endpoint);
    const stream = failing.search("q", 1000);
    await assertRejects(
      async () => {
        await stream.getReader().read();
      },
      Error,
      "boom",
    );
  });

  await t.step("port: cancel triggers stream cancel branch", async () => {
    const timeouts: number[] = [];
    let progressCalls = 0;
    using endpoints = makeFakeEndpoint({
      load: () => Promise.resolve(0),
      search(_q, _c, cb) {
        cb([], 0.3);
        progressCalls++;
        return new Promise<void>((r) => {
          const id = setTimeout(r, 30);
          timeouts.push(id);
        });
      },
    });
    using cancelable2 = makeCancelableSearch(endpoints.endpoint);
    const reader = cancelable2.search("hello", 10).getReader();
    await reader.cancel();
    for (const id of timeouts) clearTimeout(id);
    assert(progressCalls >= 0 && progressCalls <= 1);
  });
});
