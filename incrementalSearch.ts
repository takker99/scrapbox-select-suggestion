import { Candidate, CandidateWithPoint, makeFilter } from "./search.ts";

export interface IncrementalSearchOptions {
  /** 一度に検索する候補の最大数
   *
   * @default 1000
   */
  chunk?: number;
}

/** 中断可能な検索メソッド */
export const incrementalSearch = (
  query: string,
  options?: IncrementalSearchOptions,
):
  | ((
    source: Candidate[],
  ) => AsyncGenerator<CandidateWithPoint[], void, unknown>)
  | undefined => {
  const filter = makeFilter(query);
  if (!filter) return;

  return (async function* (source: Candidate[]) {
    const chunk = options?.chunk ?? 1000;
    const total = Math.floor(source.length / chunk) + 1;

    // 検索する
    for (let i = 0; i < total; i++) {
      // 検索中断命令を受け付けるためのinterval
      await new Promise((resolve) => requestAnimationFrame(resolve));

      yield [...filter(source.slice(i * chunk, (i + 1) * chunk))];
    }
  });
};
