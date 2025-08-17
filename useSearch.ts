import { useCallback, useEffect, useMemo, useReducer } from "./deps/preact.tsx";
import { compareAse } from "./sort.ts";
import type { Candidate } from "./source.ts";
import type { MatchInfo } from "./search.ts";
import { makeCancelableSearch } from "./cancelableSearch.ts";
import { throttle } from "./deps/throttle.ts";
import { createDebug } from "./deps/debug.ts";
import { type Action, createReducer, isSearching } from "./search-state.ts";
import { SharedWorkerSupported } from "./deps/sharedworker.ts";

const logger = createDebug("scrapbox-select-suggestion:useSearch.ts");

export interface Item {
  title: string;
  dist: number;
  projects: string[];
}

export interface SearchResult {
  /** 各projectの並び順を決める値 */
  projectScore: Map<string, number>;
  /** 検索結果 */
  items: Item[];
  /** 検索の進捗率 */
  progress: number;
}

export interface SearchAction {
  /** 検索を実行する
   *
   * @param query 検索クエリ
   */
  (query: string): void;
}

export interface UseSearchOptions {
  /**
   * 初期プロジェクト
   */
  projects: Iterable<string>;

  /** WebWorkerのスクリプトURL
   *
   * bundleされたworkerファイルのURLを指定する
   */
  workerUrl: string;
}

/** あいまい検索するhooks */
export const useSearch = (
  query: string,
  options: UseSearchOptions,
): SearchResult | undefined => {
  const search = useMemo(
    () =>
      makeCancelableSearch(
        SharedWorkerSupported
          ? new SharedWorker(options.workerUrl, { type: "module" }).port
          : new Worker(options.workerUrl, { type: "module" }),
      ),
    [options.workerUrl],
  );
  useEffect(() => {
    search.load(options.projects);

    return () => {
      using _ = search;
    };
  }, [search, options.projects]);

  const reducer = useCallback(
    createReducer(
      (query) => {
        let aborted = false;

        return {
          run: async () => {
            const throttledDispatch = throttle<[Action], void>(
              (value, state) => {
                if (state === "discarded") return;
                if (aborted) return;
                dispatch(value);
              },
              { interval: 500, maxQueued: 0 },
            );

            let stack: (Candidate & MatchInfo)[] = [];
            for await (
              const [candidates, progress] of search.search(query, 10000)
            ) {
              if (aborted) return;
              // 非破壊的にstackに追加することで、`reducer`内での`===`比較が効くようにする
              stack = [...stack, ...candidates];

              // 進捗率を更新する
              dispatch({ progress });

              // 見つからなければ更新しない
              if (candidates.length === 0) continue;

              // 500msごとに返却する
              throttledDispatch({ progress, candidates: stack });
            }
            // 最低一度は返却する
            // また、timerが終了していなかった場合は、それを止めて代わりにここで実行する
            throttledDispatch({ progress: 1.0, candidates: stack });
          },
          abort: () => aborted = true,
        };
      },
    ),
    [search],
  );

  const [useSearchState, dispatch] = useReducer(reducer, { query: "" });
  useEffect(() => dispatch({ query }), [query]);

  return useMemo(
    (): SearchResult | undefined => {
      if (!isSearching(useSearchState)) return;

      // 並べ替え & 加工して返却する
      const [projectScore, items] = sortAndScoring(useSearchState.candidates);
      logger.debug("Detect changes", {
        progress: useSearchState.progress,
        items,
      });
      return {
        progress: useSearchState.progress,
        projectScore,
        items,
      };
    },
    [useSearchState],
  );
};

/** 検索結果を並べ替え、projectごとにスコアリングする
 *
 * @param candidates 検索結果
 * @returns projectごとのスコアと、並び替えた検索結果
 */
const sortAndScoring = (
  candidates: (Candidate & MatchInfo)[],
): [Map<string, number>, Item[]] => {
  const projectScore = new Map<string, number>();
  const items: Item[] = [];
  for (const page of candidates.sort(compareAse)) {
    const projects = [...page.metadata.keys()];

    // score計算
    // この値で、project絞り込みパネルでの並び順を決める
    for (const project of projects) {
      projectScore.set(
        project,
        (projectScore.get(project) ?? 0) + 0.5 ** page.dist,
      );
    }

    items.push({
      title: page.title,
      dist: page.dist,
      projects,
    });
  }

  return [projectScore, items];
};
