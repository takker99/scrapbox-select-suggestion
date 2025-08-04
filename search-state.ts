import { MatchInfo } from "./search.ts";
import { Candidate } from "./source.ts";

export type Searcher = (
  state: string,
  projects: string[],
  executedByProjectUpdate: boolean,
) => {
  run: () => Promise<void>;
  abort: () => void;
};
interface Job {
  done: Promise<void>;
  abort: () => Promise<void>;
}
export interface IdleState {
  projects: string[];
}
export interface SearchingState {
  projects: string[];
  query: string;
  job: Job;
  progress: number;
  candidates: (Candidate & MatchInfo)[];
}
export const isSearching = (state: State): state is SearchingState =>
  "query" in state;
export type State = IdleState | SearchingState;
export type Action = { projects: string[] } | { query: string } | {
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
      return { projects: state.projects };
    }
    const { run, abort } = searcher(action.query, state.projects, false);
    // 前回の検索を中断してから新しい検索を実行する
    const done = prevJob?.abort?.()?.then?.(run) ?? run();
    return {
      query: action.query,
      projects: state.projects,
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
  if ("projects" in action) {
    // 検索中でなければ、プロジェクトを更新するだけ
    if (!isSearching(state)) {
      return action.projects === state.projects ? state : action;
    }
    const { projects: prevProjects, job: prevJob, ...rest } = state;
    if (action.projects === prevProjects) return state;
    const { run, abort } = searcher(rest.query, action.projects, true);
    // 前回の検索が終わるまで待ってから新しい検索を実行する
    const done = prevJob.done.then(run);
    return {
      projects: action.projects,
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
