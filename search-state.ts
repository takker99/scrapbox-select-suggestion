import { MatchInfo } from "./search.ts";
import { Candidate } from "./source.ts";

export type Searcher = (state: string) => {
  run: () => Promise<void>;
  abort: () => void;
};
interface Job {
  done: Promise<void>;
  abort: () => Promise<void>;
}
export interface IdleState {
  query: "";
}
export interface SearchingState {
  query: string;
  job: Job;
  progress: number;
  candidates: (Candidate & MatchInfo)[];
}
export const isSearching = (state: State): state is SearchingState =>
  state.query !== "";
export type State = IdleState | SearchingState;
export type Action = { query: string } | {
  progress: number;
  candidates?: (Candidate & MatchInfo)[];
};
export const createReducer = (
  searcher: Searcher,
) =>
(state: State, action: Action): State => {
  if ("query" in action) {
    if (action.query === state.query) return state;
    const prevJob = isSearching(state) ? state.job : undefined;
    if (!action.query) {
      prevJob?.abort?.();
      return { query: "" };
    }
    const { run, abort } = searcher(action.query);
    // 前回の検索を中断してから新しい検索を実行する
    const done = prevJob?.abort?.()?.then?.(run) ?? run();
    return {
      query: action.query,
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
      candidates: isSearching(state) ? state.candidates : [],
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
