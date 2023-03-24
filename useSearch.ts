import {
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "./deps/preact.tsx";
import { useSource } from "./useSource.ts";
import { compareAse } from "./sort.ts";
import { Candidate } from "./source.ts";
import { makeFilter, MatchInfo } from "./search.ts";
import { createDebug } from "./debug.ts";

const logger = createDebug("scrapbox-select-suggestion:useSearch.ts");

export interface Item {
  title: string;
  dist: number;
  projects: string[];
}

export interface SearchResult {
  projectScore: Map<string, number>;
  items: Item[];
}

/** あいまい検索するhooks */
export const useSearch = (
  projects: Iterable<string>,
  query: string,
): SearchResult => {
  const source = useSource(projects);
  const [state, dispatch] = useReducer(reducer, {
    type: "query",
    source,
    query,
  });
  useEffect(() => dispatch({ source }), [source]);
  useEffect(() => dispatch({ query }), [query]);

  const [candidates, setCandidates] = useState<(Candidate & MatchInfo)[]>([]);
  const done = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    let terminate = false;
    done.current = (async () => {
      // 前回の検索処理が終了してから, 次のを開始する
      await done.current;

      const stack: (Candidate & MatchInfo)[] = [];
      let timer: number | undefined;
      let returned = false;
      for await (
        const candidates of incrementalSearch(state.query, state.source, {
          chunk: 5000,
        })
      ) {
        if (terminate) return;
        stack.push(...candidates);
        // 何も見つかっていないときと、ソースが更新されたときは、途中経過を返さない
        if (stack.length === 0 || state.type === "source") continue;
        clearTimeout(timer);
        timer = setTimeout(() => {
          returned = true;
          setCandidates(stack);
        }, 500);
      }
      // timerが一度も呼びされなかったとき(=500ms経過する前に検索し終わった場合)は、timerを止めて即座にここで更新する
      // これは検索結果が0件だった場合と、ソースのみが更新された場合も含む
      if (returned) return;
      setCandidates(stack);
    })();
    return () => terminate = true;
  }, [state]);

  // 並べ替え & 加工して返却する
  return useMemo(() => {
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

    return { projectScore, items };
  }, [candidates]);
};

interface State {
  type: "source" | "query";
  source: Candidate[];
  query: string;
}
type Action = { source: Candidate[] } | { query: string };

const reducer = (state: State, action: Action): State =>
  "query" in action
    ? action.query === state.query
      ? state
      : ({ type: "query", source: state.source, ...action })
    : action.source === state.source
    ? state
    : ({ type: "source", query: state.query, ...action });

interface IncrementalSearchOptions {
  /** 一度に検索する候補の最大数
   *
   * @default 1000
   */
  chunk?: number;
}

/** 中断可能な検索 */
async function* incrementalSearch(
  query: string,
  source: Candidate[],
  options?: IncrementalSearchOptions,
): AsyncGenerator<(Candidate & MatchInfo)[], void, unknown> {
  const filter = makeFilter<Candidate>(query);
  if (!filter) return;

  const chunk = options?.chunk ?? 1000;
  const total = Math.floor(source.length / chunk) + 1;
  let i = 0;
  const start = new Date();
  try {
    for (; i < total; i++) {
      // 検索中断命令を受け付けるためのinterval
      await new Promise((resolve) => requestAnimationFrame(resolve));
      yield filter(source.slice(i * chunk, (i + 1) * chunk));
    }
  } finally {
    const end = new Date();
    const ms = end.getTime() - start.getTime();
    logger.debug(
      `search ${
        (i / total * 100).toPrecision(3)
      }% of the source for "${query}" in ${ms}ms`,
    );
  }
}
