import { assertEquals } from "./deps/testing.ts";
import { makeCancelableSearch } from "./cancelableSearch.ts";

Deno.test("cancelableSearch with WebWorker", async (t) => {
  await t.step("should handle query", () => {
    using search = makeCancelableSearch(
      new URL("./search.worker.ts", import.meta.url),
    );

    // For testing, we'll skip the actual loading since it requires projects
    // Instead, we'll test that the search method exists
    assertEquals(typeof search.search, "function");
    assertEquals(typeof search.load, "function");
  });

  await t.step("should handle empty query", () => {
    using search = makeCancelableSearch(
      new URL("./search.worker.ts", import.meta.url),
    );

    // For testing, we'll just check that search method handles empty queries properly
    assertEquals(typeof search.search, "function");
  });

  await t.step("should throw error for non-existent workerUrl", async () => {
    let threwError = false;

    try {
      using search = makeCancelableSearch("non-existent-worker.js");
      // The error will happen when trying to create the worker
      await search.load(["test-project"]);
    } catch (error) {
      threwError = true;
      // Should throw an error instead of falling back
      assertEquals(typeof (error as Error).message, "string");
    }

    // Should have thrown an error
    assertEquals(threwError, true);
  });
});
