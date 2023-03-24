import { useEffect, useMemo, useRef, useState } from "./deps/preact.tsx";
import { useSource } from "./useSource.ts";
import { makeCompareAse } from "./sort.ts";
import { makeFilter, MatchInfo } from "./search.ts";
import { Candidate } from "./source.ts";
import { createDebug } from "./debug.ts";

const logger = createDebug("scrapbox-select-suggestion:useSearch.ts");

/** あいまい検索するhooks */
export const useSearch = (
  projects: string[],
  query: string,
): { title: string; projects: string[] }[] => {
  // 検索
  const source = useSource(projects);
  const [candidates, setCandidates] = useState<
    { title: string; projects: string[] }[]
  >([]);
  const compareAse = useMemo(() => makeCompareAse(projects), [projects]);
  const done = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let terminate = false;
    done.current = (async () => {
      // 前回の検索処理が終了してから, 次のを開始する
      await done.current;

      const stack: (Candidate & MatchInfo)[] = [];
      let timer: number | undefined;
      for await (
        const candidates of incrementalSearch(query, source, { chunk: 5000 })
      ) {
        if (terminate) return;
        stack.push(...candidates);
        clearTimeout(timer);
        timer = setTimeout(() => {
          setCandidates(
            stack.sort(compareAse).map((page) => ({
              title: page.title,
              projects: page.metadata.map(({ project }) => project),
            })),
          );
        }, 500);
      }
      // 検索結果が0件の場合は、候補を空にする
      if (stack.length === 0) setCandidates([]);
    })();
    return () => terminate = true;
  }, [source, query, compareAse]);

  return candidates;
};

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
      const result = filter(source.slice(i * chunk, (i + 1) * chunk));
      if (result.length === 0) continue;
      yield result;
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
