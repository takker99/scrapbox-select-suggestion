import {
  Action,
  createReducer,
  IdleState,
  isSearching,
} from "./search-state.ts";
import { Candidate } from "./source.ts";
import { MatchInfo } from "./search.ts";
import { Searcher, SearchingState } from "./search-state.ts";
import { assertEquals } from "./deps/testing.ts";
import { assertStrictEquals } from "./deps/testing.ts";

Deno.test("search-state tests", async (t) => {
  const searcherResult: {
    query?: string;
    source?: Candidate[];
    executedBySourceUpdate?: boolean;
    result?: "done" | "aborted";
  } = {};
  const flushList: (() => Promise<void>)[] = [];
  const mockSearcher: Searcher = (query, source, executedBySourceUpdate) => {
    searcherResult.query = query;
    searcherResult.source = source;
    searcherResult.executedBySourceUpdate = executedBySourceUpdate;

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
    const initialState: IdleState = { source: [] };
    await t.step("idle → searching", async () => {
      const newState = reducer(initialState, {
        query: "test",
      }) as SearchingState;

      assertEquals(newState, {
        query: "test",
        source: [],
        progress: 0,
        candidates: [],
        job: newState.job,
      });
      assertStrictEquals(newState.source, initialState.source);
      assertEquals(isSearching(newState), true);
      await flushList.shift()!();
    });

    await t.step("searching → searching", async (t) => {
      const searchingState = reducer(initialState, {
        query: "test",
      }) as SearchingState;
      assertEquals(searcherResult, {
        query: "test",
        source: [],
        executedBySourceUpdate: false,
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
        const newState = reducer(searchingState, { query: "" }) as IdleState;
        assertStrictEquals(newState.source, initialState.source);
      });

      await t.step("test → testtest", async () => {
        const newState = reducer(searchingState, {
          query: "testtest",
        }) as SearchingState;
        assertEquals(newState, {
          query: "testtest",
          source: [],
          progress: 0,
          candidates: [],
          job: newState.job,
        });
        // previous search should be aborted
        assertEquals(searcherResult, {
          query: "testtest",
          source: [],
          executedBySourceUpdate: false,
          result: "aborted",
        });
        await flushList.shift()!();
        assertEquals(searcherResult.result, "done");
      });
    });
  });

  await t.step("should handle source action", async (t) => {
    const initialState: IdleState = { source: [] };
    await t.step("idle → idle", async (t) => {
      await t.step("no changes", () => {
        assertStrictEquals(reducer(initialState, initialState), initialState);
      });
      await t.step("source changed", () => {
        const newSource: Candidate[] = [{
          title: "test",
          titleLc: "test",
          updated: 1600000000,
          linked: 1,
          metadata: new Map([["project", {}]]),
        }];
        const action: Action = { source: newSource };

        const newState = reducer(initialState, action);

        assertStrictEquals(newState, action);
        assertEquals(isSearching(newState), false);
      });
    });

    await t.step("searching → searching", async (t) => {
      const searchingState = reducer(initialState, {
        query: "test",
      }) as SearchingState;
      assertEquals(searcherResult, {
        query: "test",
        source: [],
        executedBySourceUpdate: false,
        result: searcherResult.result,
      });

      await t.step("no changes", async () => {
        assertStrictEquals(
          searchingState,
          reducer(searchingState, initialState),
        );
        await flushList.shift()!();
      });
      await t.step("source changed", async () => {
        const newSource: Candidate[] = [{
          title: "test",
          titleLc: "test",
          updated: 1600000000,
          linked: 1,
          metadata: new Map([["project", {}]]),
        }];
        const newState = reducer(searchingState, {
          source: newSource,
        }) as SearchingState;

        assertEquals(newState.query, "test");
        assertStrictEquals(newState.source, newSource);
        assertEquals(newState.progress, 0);
        assertEquals(newState.candidates, []);

        // previous search should not be aborted
        assertEquals(searcherResult, {
          query: "test",
          source: newSource,
          executedBySourceUpdate: true,
          result: "done",
        });
        await flushList.shift()!();
        assertEquals(searcherResult.result, "done");
      });
    });
  });

  await t.step("should handle progress action", () => {
    const initialState: SearchingState = {
      source: [],
      query: "test",
      job: { done: Promise.resolve(), abort: () => Promise.resolve() },
      progress: 0,
      candidates: [],
    };
    const reducer = createReducer(mockSearcher);
    const state = initialState;
    const action: Action = { progress: 50 };

    const newState = reducer(state, action) as SearchingState;

    assertEquals(newState.progress, 50);
    assertEquals(newState.query, "test");
    assertEquals(isSearching(newState), true);
  });

  await t.step("should handle candidates action", () => {
    const initialState: SearchingState = {
      source: [],
      query: "test",
      job: { done: Promise.resolve(), abort: () => Promise.resolve() },
      progress: 0,
      candidates: [],
    };
    const reducer = createReducer(mockSearcher);
    const state = initialState;
    const newCandidates: (Candidate & MatchInfo)[] = [{
      title: "test",
      titleLc: "test",
      updated: 1600000000,
      linked: 1,
      metadata: new Map([["project", {}]]),
      dist: 0,
      matches: [],
    }];
    const action: Action = { progress: 100, candidates: newCandidates };

    const newState = reducer(state, action) as SearchingState;

    assertEquals(newState.progress, 100);
    assertEquals(newState.candidates, newCandidates);
    assertEquals(isSearching(newState), true);
  });
});
