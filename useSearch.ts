import { useCallback, useMemo, useReducer } from "./deps/preact.tsx";
import { compareAse } from "./sort.ts";
import { Candidate } from "./source.ts";
import { MatchInfo } from "./search.ts";
import { cancelableSearch } from "./cancelableSearch.ts";
import { throttle } from "./deps/throttle.ts";
import { createDebug } from "./deps/debug.ts";
import {
  Action,
  createReducer,
  isSearching,
  Searcher,
} from "./search-state.ts";

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
  search: (query: string) => void;

  /** ソースを更新し、再検索する
   *
   * @param source 新しいソース
   */
  update: (source: Candidate[]) => void;
}

/** あいまい検索するhooks */
export const useSearch = (
  initialSource: Candidate[],
): [SearchResult | undefined, SearchAction] => {
  const executeSearch: Searcher = useCallback(
    (
      query,
      source,
      executedBySourceUpdate,
    ) => {
      let aborted = false;
      const iterator = cancelableSearch(query, source, {
        chunk: 5000,
      });

      return {
        run: async () => {
          // ソース更新をトリガーにした再検索は、すべて検索し終わってから返す
          if (executedBySourceUpdate) {
            const stack: (Candidate & MatchInfo)[] = [];
            for await (const [candidates] of iterator) {
              if (aborted) return;
              stack.push(...candidates);
            }
            dispatch({ progress: 1.0, candidates: stack });
            return;
          }
          const throttledDispatch = throttle<[Action], void>(
            (value, state) => {
              if (state === "discarded") return;
              if (aborted) return;
              dispatch(value);
            },
            { interval: 500, maxQueued: 0 },
          );
          let stack: (Candidate & MatchInfo)[] = [];
          for await (const [candidates, progress] of iterator) {
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
    [],
  );
  const [useSearchState, dispatch] = useReducer(
    useMemo(() => createReducer(executeSearch), [executeSearch]),
    {
      source: initialSource,
    },
  );

  return [
    useMemo(
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
    ),
    {
      search: useCallback((query: string) => dispatch({ query }), []),
      update: useCallback((source: Candidate[]) => dispatch({ source }), []),
    },
  ];
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
