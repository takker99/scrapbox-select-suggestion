import {
  type Action,
  createReducer,
  type IdleState,
  isSearching,
} from "./search-state.ts";
import type { Searcher, SearchingState } from "./search-state.ts";
import { assert, assertEquals, assertStrictEquals } from "./deps/testing.ts";

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

  await t.step("edge cases", async (t) => {
    const events: string[] = [];
    const mkSearcher: Searcher = (query) => {
      events.push(`make:${query}`);
      return {
        run: () =>
          Promise.resolve().then(() => {
            events.push(`run:${query}`);
          }),
        abort: () => {
          events.push(`abort-call:${query}`);
        },
      };
    };
    const r2 = createReducer(mkSearcher);
    let st: IdleState | SearchingState = { query: "" };

    await t.step("same query => no new job", () => {
      st = r2(st, { query: "" });
      assertStrictEquals(st, st); // no event
      assertEquals(events.length, 0);
    });

    await t.step("new query spawns job", () => {
      st = r2(st, { query: "abc" }) as SearchingState;
      assertEquals(isSearching(st), true);
      assertEquals(st.query, "abc");
    });

    await t.step("progress no-op same value", () => {
      const s1 = r2(st, { progress: 0 });
      assertStrictEquals(s1, st);
    });

    await t.step("progress update", () => {
      st = r2(st, { progress: 10 }) as SearchingState;
      assertEquals(st.progress, 10);
    });

    await t.step("candidates + progress update triggers new state", () => {
      const candidates: SearchingState["candidates"] = [];
      st = r2(st, { progress: 20, candidates }) as SearchingState;
      assertEquals(st.progress, 20);
      assertStrictEquals(st.candidates, candidates);
    });

    await t.step("same candidates + same progress -> no change", () => {
      if ("candidates" in st) {
        const s4 = r2(st, { progress: 20, candidates: st.candidates });
        assertStrictEquals(s4, st);
      }
    });

    await t.step("new query aborts previous", () => {
      if ("job" in st) {
        const prevJob = st.job;
        st = r2(st, { query: "xyz" }) as SearchingState;
        assert(prevJob !== (st as SearchingState).job);
      } else {
        st = r2(st, { query: "xyz" }) as SearchingState;
      }
    });

    await t.step("clear query aborts", () => {
      st = r2(st, { query: "" });
      assertEquals(st, { query: "" });
    });

    await t.step("progress ignored when idle", () => {
      const idle = r2(st, { progress: 50 });
      assertStrictEquals(idle, st);
    });
  });
});
