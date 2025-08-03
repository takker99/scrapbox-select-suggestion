/// <reference no-default-lib="true" />
/// <reference lib="webworker" />
/// <reference lib="es2020" />

import { bitDP } from "./bitDP.ts";
import type { Candidate } from "./source.ts";

// Simple fallback for revertTitleLc - replaces underscores with spaces
const revertTitleLc = (text: string): string => text.replace(/_/g, " ");

export interface MatchInfo {
  /** 編集距離 */
  dist: number;

  /** queryがマッチした位置
   *
   * - 1番目：開始位置
   * - 2番目：終了位置
   */
  matches: [number, number][];
}

// deno-fmt-ignore
const getMaxDistance = [
  0, // 空文字のとき
  0, 0,
  1, 1,
  2, 2, 2, 2,
  3, 3, 3, 3, 3, 3,
  4, 4, 4, 4, 4, 4, 4, 4, 4, 4,
  5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5,
  6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6,
];

/** 一致する候補をしぼりこむ函数*/
interface Filter<T extends Candidate> {
  /** 一致する候補をしぼりこむ函数
   *
   * @param source 検索候補リスト
   * @return 一致した候補
   */
  (source: readonly T[]): (T & MatchInfo)[];
}

/** `query`に曖昧一致する候補を絞り込む函数を作る
 *
 * @param query 検索語句
 * @return 検索函数。検索不要なときは`undefined`を返す
 */
const makeFilter = <T extends Candidate>(
  query: string,
): Filter<T> | undefined => {
  /** キーワードリスト
   *
   * - 空白は取り除く
   * - `_`は空白とみなす
   * - 長い順に並び替えておく
   *   - 長いqueryから検索したほうが、少なく絞り込める
   */
  const queries = revertTitleLc(query.trim()).split(/\s+/)
    .sort((a, b) => b.length - a.length);
  if (queries.length === 0 || queries.every((q) => q === "")) return;

  return (source) => {
    let result = [...source];
    for (const query of queries) {
      result = filter(query, result);
    }
    return result as (T & MatchInfo)[];
  };
};

const filter = <T extends Candidate>(
  query: string,
  source: (T & Partial<MatchInfo>)[],
): (T & MatchInfo)[] => {
  const m = [...query].length;
  const maxDistance = getMaxDistance[m];
  const filter_ = bitDP(query);

  return source.flatMap(
    ({ title, dist, matches, ...props }) => {
      matches ??= [];
      dist ??= 0;

      const result = filter_(title)
        .flatMap((d, i) =>
          d <= maxDistance &&
            // 別のqueryでマッチした箇所は除く
            matches!.every(([s, e]) => i + m <= s || e < i)
            ? [[i, d]]
            : []
        );
      if (result.length === 0) return [];

      const newMatch = result.reduce((prev, [i, dist]) => {
        if (prev.dist <= dist) return prev;
        prev.dist = dist;
        prev.start = i;
        return prev;
      }, { dist: m, start: 0 });

      matches.push([newMatch.start, newMatch.start + m - 1]);
      return [
        {
          title,
          dist: newMatch.dist + dist,
          matches,
          ...props,
        } as (T & MatchInfo),
      ];
    },
  );
};

interface SearchRequest {
  id: string;
  query: string;
  source: Candidate[];
  chunk: number;
}

interface SearchProgress {
  id: string;
  type: "progress";
  candidates: (Candidate & MatchInfo)[];
  progress: number;
}

interface SearchComplete {
  id: string;
  type: "complete";
}

interface SearchError {
  id: string;
  type: "error";
  error: string;
}

type SearchResponse = SearchProgress | SearchComplete | SearchError;

declare const self: DedicatedWorkerGlobalScope;

let currentSearchId: string | null = null;
let shouldAbort = false;

self.addEventListener("message", async (event) => {
  const { id, query, source, chunk }: SearchRequest = event.data;

  // Cancel previous search if running
  if (currentSearchId && currentSearchId !== id) {
    shouldAbort = true;
  }

  currentSearchId = id;
  shouldAbort = false;

  try {
    const filter = makeFilter<Candidate>(query);
    if (!filter) {
      self.postMessage({ id, type: "complete" } as SearchComplete);
      return;
    }

    const total = Math.floor(source.length / chunk) + 1;
    let processedChunks = 0;

    for (let i = 0; i < total; i++) {
      // Check if we should abort
      if (shouldAbort && currentSearchId !== id) {
        return;
      }

      const chunkStart = i * chunk;
      const chunkEnd = (i + 1) * chunk;
      const chunkData = source.slice(chunkStart, chunkEnd);
      
      const candidates = filter(chunkData);
      processedChunks++;
      
      const progress = processedChunks / total;

      self.postMessage({
        id,
        type: "progress",
        candidates,
        progress,
      } as SearchProgress);

      // Yield control to allow for cancellation
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    self.postMessage({ id, type: "complete" } as SearchComplete);
  } catch (error) {
    self.postMessage({
      id,
      type: "error",
      error: error instanceof Error ? error.message : String(error),
    } as SearchError);
  }
});

// Handle worker termination request
self.addEventListener("message", (event) => {
  if (event.data.type === "abort" && event.data.id === currentSearchId) {
    shouldAbort = true;
  }
});