import { useEffect, useReducer, useRef, useState } from "./deps/preact.tsx";
import { Link, useSource } from "./useSource.ts";
import { compareAse } from "./sort.ts";
import { makeFilter, MatchInfo } from "./search.ts";
import { createDebug } from "./debug.ts";

const logger = createDebug("scrapbox-select-suggestion:useSearch.ts");

/** 検索結果 */
export interface SearchResult {
  /** candidatesの編集距離から計算されるスコア
   *
   * これをもとにprojectの優先順位を作る
   */
  point: number;

  /** 一番短い編集距離でマッチした候補の、その編集距離
   *
   * projectの並び替えで使う
   */
  leastDistanceMatched: number;

  /** 検索結果 */
  candidates: (Link & MatchInfo)[];
}

/** あいまい検索するhooks */
export const useSearch = (
  projects: string[],
  query: string,
): Map<string, SearchResult> => {
  const source = useSource(projects);
  const [state, dispatch] = useReducer(reducer, {
    type: "query",
    source,
    query,
  });
  useEffect(() => dispatch({ source }), [source]);
  useEffect(() => dispatch({ query }), [query]);

  const [candidates, setCandidates] = useState(new Map<string, SearchResult>());
  const done = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    let terminate = false;
    done.current = (async () => {
      // 前回の検索処理が終了してから, 次のを開始する
      await done.current;

      /** このMapに新しい検索結果を入れていく */
      const resultMap = new Map<string, SearchResult>();
      let calledSetCandidate = false;
      for (const [project, links] of state.source.entries()) {
        const stack: (Link & MatchInfo)[] = [];

        let timer: number | undefined;
        // project内のリンクをあいまい検索する
        for await (
          const candidates of incrementalSearch(state.query, links, {
            chunk: 5000,
          })
        ) {
          if (terminate) return;
          stack.push(...candidates);
          // 何も見つかっていないときと、ソース更新をトリガーにした検索のときは、途中経過を返さない
          if (stack.length === 0 || state.type === "source") continue;

          clearTimeout(timer);
          timer = setTimeout(() => {
            resultMap.set(project, makeSearchResult(stack));
            setCandidates(new Map(resultMap));
            calledSetCandidate = true;
          }, 500);
        }

        // ソース更新をトリガーにした検索のときは、for loop内で一度もmapにデータが格納されないので、ここで格納しておく
        if (state.type === "source") {
          resultMap.set(project, makeSearchResult(stack));
        }
      }

      // setCandidateが一度も呼び出されなかった時(=500ms経過する前に検索し終わった場合)は、timerを止めて即座にここで更新する
      // これは検索結果が0件だった場合と、ソースのみが更新された場合も含む
      if (calledSetCandidate) return;
      setCandidates(new Map(resultMap));
    })();

    return () => terminate = true;
  }, [state]);

  return candidates;
};

/** 検索結果の並び替え & 統計データ取得 */
const makeSearchResult = (links: (Link & MatchInfo)[]) => {
  links.sort(compareAse);

  const candidates: (Link & MatchInfo)[] = [];
  let point = 0;
  let leastDistanceMatched = 10000;
  for (const link of links) {
    point += 0.5 ** link.dist;
    if (leastDistanceMatched > link.dist) leastDistanceMatched = link.dist;
  }

  return { point, leastDistanceMatched, candidates };
};

interface State {
  type: "source" | "query";
  source: Map<string, Link[]>;
  query: string;
}
type Action = { source: Map<string, Link[]> } | { query: string };

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
  source: Link[],
  options?: IncrementalSearchOptions,
): AsyncGenerator<(Link & MatchInfo)[], void, unknown> {
  const filter = makeFilter<Link>(query);
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
