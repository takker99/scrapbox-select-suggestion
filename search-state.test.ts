import {
  type Action,
  createReducer,
  type IdleState,
  isSearching,
} from "./search-state.ts";
import type { Searcher, SearchingState } from "./search-state.ts";
import { assertEquals } from "./deps/testing.ts";
import { assertStrictEquals } from "./deps/testing.ts";

Deno.test("search-state tests", async (t) => {
  const searcherResult: {
    query?: string;
    result?: "done" | "aborted";
  } = {};
  const flushList: (() => Promise<void>)[] = [];
  const mockSearcher: Searcher = (query) => {
    searcherResult.query = query;

    const { promise, resolve } = Promise.withResolvers<void>();
    const done = promise.then(() => {
      searcherResult.result = "done";
      const index = flushList.indexOf(flush);
      if (index >= 0) flushList.splice(index, 1);
    });
    const flush = () => {
      resolve();
      return done;
    };
    flushList.push(flush);

    return {
      run: () => done,
      abort: () => {
        flush().then(() => {
          searcherResult.result = "aborted";
        });
      },
    };
  };
  const reducer = createReducer(mockSearcher);

  await t.step("should handle query action", async (t) => {
    const initialState: IdleState = { query: "" };
    await t.step("idle → searching", async () => {
      const newState = reducer(initialState, {
        query: "test",
      }) as SearchingState;

      assertEquals(newState, {
        query: "test",
        progress: 0,
        candidates: [],
        job: newState.job,
      });
      assertEquals(isSearching(newState), true);
      await flushList.shift()!();
    });

    await t.step("searching → searching", async (t) => {
      const searchingState = reducer(initialState, {
        query: "test",
      }) as SearchingState;
      assertEquals(searcherResult, {
        query: "test",
        result: searcherResult.result,
      });

      await t.step("test → test", async () => {
        assertStrictEquals(
          searchingState,
          reducer(searchingState, { query: "test" }),
        );
        await flushList.shift()!();
      });

      await t.step('test → ""', () => {
        assertEquals({ query: "" }, reducer(searchingState, { query: "" }));
      });

      await t.step("test → testtest", async () => {
        const newState = reducer(searchingState, {
          query: "testtest",
        }) as SearchingState;
        assertEquals(newState, {
          query: "testtest",
          progress: 0,
          candidates: [],
          job: newState.job,
        });
        // previous search should be aborted
        assertEquals(searcherResult, {
          query: "testtest",
          result: "aborted",
        });
        await flushList.shift()!();
        assertEquals(searcherResult.result, "done");
      });
    });
  });

  await t.step("should handle progress action", async (t) => {
    const action: Action = {
      progress: 50,
      candidates: [{
        title: "test",
        titleLc: "test",
        updated: 1600000000,
        linked: 1,
        metadata: new Map([["project", {}]]),
        dist: 0,
        matches: [],
      }],
    };
    await t.step("idle", () => {
      const initialState: IdleState = { query: "" };
      assertStrictEquals(reducer(initialState, action), initialState);
    });
    await t.step("searching", () => {
      const initialState: SearchingState = {
        query: "test",
        job: { done: Promise.resolve(), abort: () => Promise.resolve() },
        progress: 0,
        candidates: [],
      };

      const newState = reducer(initialState, action) as SearchingState;
      assertEquals(newState.progress, 50);
      assertEquals(newState.query, "test");
      assertStrictEquals(newState.candidates, action.candidates);
      assertEquals(isSearching(newState), true);
    });
  });
});
