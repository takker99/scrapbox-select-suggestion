import { Candidate, makeFilter, MatchInfo } from "./search.ts";
import { createDebug } from "./deps/debug.ts";

const logger = createDebug("scrapbox-select-suggestion:cancelableSearch.ts");

export interface CancelableSearchOptions {
  /** 一度に検索する候補の最大数
   *
   * @default 1000
   */
  chunk?: number;
}

/** 中断可能な検索 */
export async function* cancelableSearch<Item extends Candidate>(
  query: string,
  source: Item[],
  options?: CancelableSearchOptions,
): AsyncGenerator<[(Item & MatchInfo)[], number], void, unknown> {
  const filter = makeFilter<Item>(query);
  if (!filter) return;

  const chunk = options?.chunk ?? 1000;
  const total = Math.floor(source.length / chunk) + 1;
  let i = 0;
  const start = new Date();
  try {
    for (; i < total; i++) {
      // 検索中断命令を受け付けるためのinterval
      await new Promise((resolve) => requestAnimationFrame(resolve));
      yield [filter(source.slice(i * chunk, (i + 1) * chunk)), (i + 1) / total];
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
