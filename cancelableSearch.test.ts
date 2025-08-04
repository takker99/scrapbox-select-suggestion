import { assertEquals } from "./deps/testing.ts";
import { makeCancelableSearch } from "./cancelableSearch.ts";
import { Candidate } from "./source.ts";

Deno.test("cancelableSearch with WebWorker", async (t) => {
  const sampleCandidates: Candidate[] = [
    {
      title: "test page",
      titleLc: "test page",
      updated: 1600000000,
      linked: 1,
      metadata: new Map([["project", {}]]),
    },
    {
      title: "another test",
      titleLc: "another test",
      updated: 1600000001,
      linked: 2,
      metadata: new Map([["project", {}]]),
    },
    {
      title: "unrelated page",
      titleLc: "unrelated page",
      updated: 1600000002,
      linked: 0,
      metadata: new Map([["project", {}]]),
    },
  ];

  await t.step("should handle query", async () => {
    using search = makeCancelableSearch<Candidate>(
      new URL("./search.worker.ts", import.meta.url),
    );

    const results = await Array.fromAsync(search("test", sampleCandidates));

    assertEquals(results, [[[
      { dist: 0, matches: [[0, 3]], ...sampleCandidates[0] },
      { dist: 0, matches: [[8, 11]], ...sampleCandidates[1] },
    ], 1]]);
  });

  await t.step("should handle empty query", async () => {
    using search = makeCancelableSearch<Candidate>(
      new URL("./search.worker.ts", import.meta.url),
    );

    const results = await Array.fromAsync(search("", sampleCandidates));

    // Should return no results for empty query
    assertEquals(results, []);
  });

  await t.step("should throw error for non-existent workerUrl", async () => {
    let threwError = false;

    try {
      using search = makeCancelableSearch<Candidate>("non-existent-worker.js");
      const _ = await Array.fromAsync(search("test", sampleCandidates));
    } catch (error) {
      threwError = true;
      // Should throw an error instead of falling back
      assertEquals(typeof (error as Error).message, "string");
    }

    // Should have thrown an error
    assertEquals(threwError, true);
  });
});
