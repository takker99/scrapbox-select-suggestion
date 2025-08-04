import { assertEquals } from "./deps/testing.ts";
import { cancelableSearch } from "./cancelableSearch.ts";
import { Candidate } from "./source.ts";
import { MatchInfo } from "./search.ts";

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

  await t.step("should handle empty query", async () => {
    const results: [(Candidate & MatchInfo)[], number][] = [];

    for await (
      const result of cancelableSearch("", sampleCandidates, {
        workerUrl: "test-worker.js",
      })
    ) {
      results.push(result);
    }

    // Should return no results for empty query
    assertEquals(results.length, 0);
  });

  await t.step("should throw error for non-existent workerUrl", async () => {
    let threwError = false;

    try {
      const results: [(Candidate & MatchInfo)[], number][] = [];
      for await (
        const result of cancelableSearch("test", sampleCandidates, {
          workerUrl: "non-existent-worker.js",
        })
      ) {
        results.push(result);
      }
    } catch (error) {
      threwError = true;
      // Should throw an error instead of falling back
      assertEquals(typeof (error as Error).message, "string");
    }

    // Should have thrown an error
    assertEquals(threwError, true);
  });
});
