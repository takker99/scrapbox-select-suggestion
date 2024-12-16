import { MatchInfo } from "./search.ts";
import { Candidate } from "./source.ts";

export type Searcher = (
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
export interface IdleState {
  source: Candidate[];
}
export interface SearchingState {
  source: Candidate[];
  query: string;
  job: Job;
  progress: number;
  candidates: (Candidate & MatchInfo)[];
}
export const isSearching = (state: State): state is SearchingState =>
  "query" in state;
export type State = IdleState | SearchingState;
export type Action = { source: Candidate[] } | { query: string } | {
  progress: number;
  candidates?: (Candidate & MatchInfo)[];
};
export const createReducer = (
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
    const { run, abort } = searcher(rest.query, action.source, true);
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
