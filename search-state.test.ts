import {
  Action,
  createReducer,
  IdleState,
  isSearching,
} from "./search-state.ts";
import { Searcher, SearchingState } from "./search-state.ts";
import { assertEquals } from "./deps/testing.ts";
import { assertStrictEquals } from "./deps/testing.ts";

Deno.test("search-state tests", async (t) => {
  const searcherResult: {
    query?: string;
    projects?: string[];
    executedByProjectUpdate?: boolean;
    result?: "done" | "aborted";
  } = {};
  const flushList: (() => Promise<void>)[] = [];
  const mockSearcher: Searcher = (query, projects, executedByProjectUpdate) => {
    searcherResult.query = query;
    searcherResult.projects = projects;
    searcherResult.executedByProjectUpdate = executedByProjectUpdate;

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
    const initialState: IdleState = { projects: ["test-project"] };
    await t.step("idle → searching", async () => {
      const newState = reducer(initialState, {
        query: "test",
      }) as SearchingState;

      assertEquals(newState, {
        query: "test",
        projects: ["test-project"],
        progress: 0,
        candidates: [],
        job: newState.job,
      });
      assertStrictEquals(newState.projects, initialState.projects);
      assertEquals(isSearching(newState), true);
      await flushList.shift()!();
    });

    await t.step("searching → searching", async (t) => {
      const searchingState = reducer(initialState, {
        query: "test",
      }) as SearchingState;
      assertEquals(searcherResult, {
        query: "test",
        projects: ["test-project"],
        executedByProjectUpdate: false,
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
        assertStrictEquals(newState.projects, initialState.projects);
      });

      await t.step("test → testtest", async () => {
        const newState = reducer(searchingState, {
          query: "testtest",
        }) as SearchingState;
        assertEquals(newState, {
          query: "testtest",
          projects: ["test-project"],
          progress: 0,
          candidates: [],
          job: newState.job,
        });
        // previous search should be aborted
        assertEquals(searcherResult, {
          query: "testtest",
          projects: ["test-project"],
          executedByProjectUpdate: false,
          result: "aborted",
        });
        await flushList.shift()!();
        assertEquals(searcherResult.result, "done");
      });
    });
  });

  await t.step("should handle source action", async (t) => {
    const initialState: IdleState = { projects: ["test-project"] };
    await t.step("idle → idle", async (t) => {
      await t.step("no changes", () => {
        assertStrictEquals(reducer(initialState, initialState), initialState);
      });
      await t.step("source changed", () => {
        const newProjects: string[] = ["new-project", "another-project"];
        const action: Action = { projects: newProjects };

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
        projects: ["test-project"],
        executedByProjectUpdate: false,
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
        const newProjects: string[] = ["updated-project"];
        const newState = reducer(searchingState, {
          projects: newProjects,
        }) as SearchingState;

        assertEquals(newState.query, "test");
        assertStrictEquals(newState.projects, newProjects);
        assertEquals(newState.progress, 0);
        assertEquals(newState.candidates, []);

        // previous search should not be aborted
        assertEquals(searcherResult, {
          query: "test",
          projects: newProjects,
          executedByProjectUpdate: true,
          result: "done",
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
      const initialState: IdleState = { projects: ["test-project"] };
      assertStrictEquals(reducer(initialState, action), initialState);
    });
    await t.step("searching", () => {
      const initialState: SearchingState = {
        projects: ["test-project"],
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
