import { useCallback, useMemo, useReducer } from "./deps/preact.tsx";
import { compareAse } from "./sort.ts";
import { Candidate } from "./source.ts";
import { MatchInfo } from "./search.ts";
import { cancelableSearch } from "./cancelableSearch.ts";
import { debounce } from "./deps/async.ts";
import { createDebug } from "./deps/debug.ts";

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
          const debouncedDispatch = debounce(dispatch, 500);
          let returned = false;
          let stack: (Candidate & MatchInfo)[] = [];
          for await (const [candidates, progress] of iterator) {
            if (aborted) {
              debouncedDispatch.clear();
              return;
            }
            // 非破壊的にstackに追加することで、`reducer`内での`===`比較が効くようにする
            stack = [...stack, ...candidates];

            // 進捗率を更新する
            dispatch({ progress });

            // 見つからなければ更新しない
            if (candidates.length === 0) continue;

            // 500msごとに返却する
            debouncedDispatch({ progress, candidates: stack });

            // 初回は即座に結果を返す
            if (!returned) {
              debouncedDispatch.flush();
              returned = true;
            }
          }
          // 最低一度は返却する
          // また、timerが終了していなかった場合は、それを止めて代わりにここで実行する
          debouncedDispatch({ progress: 1.0, candidates: stack });
          debouncedDispatch.flush();
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

type Searcher = (
  state: string,
  source: Candidate[],
  executedBySourceUpdate: boolean,
) => {
  run: () => Promise<void>;
  abort: () => void;
};

interface Job {
  done: Promise<void>;
  abort: () => Promise<void>;
}

interface IdleState {
  source: Candidate[];
}
interface SearchingState {
  source: Candidate[];
  query: string;
  job: Job;
  progress: number;
  candidates: (Candidate & MatchInfo)[];
}
const isSearching = (state: State): state is SearchingState => "query" in state;
type State = IdleState | SearchingState;
type Action = { source: Candidate[] } | { query: string } | {
  progress: number;
  candidates?: (Candidate & MatchInfo)[];
};

const createReducer = (
  searcher: Searcher,
) =>
(state: State, action: Action): State => {
  if ("query" in action) {
    const prevQuery = isSearching(state) ? state.query : "";
    if (action.query === prevQuery) return state;
    const prevJob = isSearching(state) ? state.job : undefined;
    if (!action.query) {
      prevJob?.abort?.();
      return { source: state.source };
    }
    const { run, abort } = searcher(action.query, state.source, false);
    // 前回の検索を中断してから新しい検索を実行する
    const done = prevJob?.abort?.()?.then?.(run) ?? run();
    return {
      query: action.query,
      source: state.source,
      job: {
        done,
        abort: () => {
          abort();
          return done;
        },
      },
      progress: 0,
      // 検索中 (前回のqueryが空でない)は前回の結果を消さずに表示する
      // でないと文字入力するたびにcomponentがリセットされてしまい、大変ちらつく
      candidates: !prevQuery || !isSearching(state) ? [] : state.candidates,
    };
  }
  if ("source" in action) {
    // 検索中でなければ、ソースを更新するだけ
    if (!isSearching(state)) {
      return action.source === state.source ? state : action;
    }
    const { source: prevSource, job: prevJob, ...rest } = state;
    if (action.source === prevSource) return state;
    const { run, abort } = searcher(state.query, prevSource, false);
    // 前回の検索が終わるまで待ってから新しい検索を実行する
    const done = prevJob.done.then(run);
    return {
      source: action.source,
      job: {
        done,
        abort: () =>
          // 前回の検索を中断してから、今回の検索を中断する
          prevJob.abort().then(() => {
            abort();
            return done;
          }),
      },
      ...rest,
    };
  }
  // 検索中でないときに来た検索結果は無視する
  if (!isSearching(state)) return state;

  if (!action.candidates) {
    const { progress: prevProgress, ...rest } = state;
    return prevProgress === action.progress
      ? state
      : { progress: action.progress, ...rest };
  }

  const { candidates: prevCandidates, progress: prevProgress, ...rest } = state;

  return prevCandidates === action.candidates &&
      prevProgress === action.progress
    ? state
    : {
      candidates: action.candidates ?? prevCandidates,
      progress: action.progress,
      ...rest,
    };
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
    const projects = page.metadata.map(({ project }) => project);

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
