import { Candidate, filter, sort } from "./search.ts";

export interface IncrementalSearchOptions {
  /** 一度に検索する候補の最大数
   *
   * @default 1000
   */
  chunk?: number;
  /** 検索結果を返す時間間隔 (単位はms)
   *
   * @default 500
   */
  interval?: number;
}

/** 中断可能な検索メソッド */
export const incrementalSearch = (
  query: string,
  source: Candidate[],
  listener: (candidates: Candidate[]) => void,
  options?: IncrementalSearchOptions,
): () => void => {
  let terminate = false;
  let timer: number | undefined;
  const candidates: (Candidate & { point: number })[] = [];
  const update = () => {
    listener(sort(candidates));
    timer = undefined;
  };

  (async () => {
    // 検索する
    for (const results of filter(query, source, options?.chunk ?? 1000)) {
      // 検索中断命令を受け付けるためのinterval
      await new Promise((resolve) => requestAnimationFrame(resolve));
      if (terminate) return;

      candidates.push(...results);
      if (timer !== undefined) continue;
      update();
      timer = setTimeout(update, options?.interval ?? 500);
    }
  })();

  // 検索を中断させる
  return () => {
    terminate = true;
    clearTimeout(timer);
  };
};
