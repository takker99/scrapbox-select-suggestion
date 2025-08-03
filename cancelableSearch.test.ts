import { assertEquals } from "./deps/testing.ts";
import { cancelableSearch } from "./cancelableSearch.ts";
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

  await t.step("should fallback to original implementation when no workerUrl provided", async () => {
    const results: [(Candidate & any)[], number][] = [];
    
    for await (const result of cancelableSearch("test", sampleCandidates)) {
      results.push(result);
    }
    
    // Should have at least one result
    assertEquals(results.length > 0, true);
    
    // Final result should have progress of 1.0
    const finalResult = results[results.length - 1];
    assertEquals(finalResult[1], 1.0);
    
    // Should find matching candidates
    const candidates = finalResult[0];
    assertEquals(candidates.length >= 2, true); // "test page" and "another test"
    
    // Check that matching candidates have the expected structure
    for (const candidate of candidates) {
      assertEquals(typeof candidate.title, "string");
      assertEquals(typeof candidate.dist, "number");
      assertEquals(Array.isArray(candidate.matches), true);
    }
  });

  await t.step("should handle empty query", async () => {
    const results: [(Candidate & any)[], number][] = [];
    
    for await (const result of cancelableSearch("", sampleCandidates)) {
      results.push(result);
    }
    
    // Should return no results for empty query
    assertEquals(results.length, 0);
  });

  await t.step("should handle non-existent workerUrl gracefully", async () => {
    const results: [(Candidate & any)[], number][] = [];
    
    try {
      for await (const result of cancelableSearch("test", sampleCandidates, { 
        workerUrl: "non-existent-worker.js" 
      })) {
        results.push(result);
      }
      
      // Should fallback and still work
      assertEquals(results.length > 0, true);
      
      const finalResult = results[results.length - 1];
      assertEquals(finalResult[1], 1.0);
    } catch (error) {
      // Should not throw errors, should fallback gracefully
      throw new Error(`Should fallback gracefully but threw: ${error.message}`);
    }
  });
});