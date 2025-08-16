import type { MatchInfo } from "./search.ts";
import type { Candidate } from "./source.ts";
import { createDebug } from "./deps/debug.ts";
import { proxy, releaseProxy, wrap } from "./deps/comlink.ts";
import type { SearchWorkerAPI } from "./worker-endpoint.ts";

const logger = createDebug("scrapbox-select-suggestion:cancelableSearch.ts");

export interface CancelableSearch extends Disposable {
  /** データを読み込む
   *
   * @param projects 読み込み対象のプロジェクトリスト
   */
  load(projects: Iterable<string>): Promise<number>;

  /** 中断可能な検索を開始する
   *
   * @param query 検索クエリ
   * @param [chunk=5000] 一度に検索する候補の最大数
   */
  search(
    query: string,
    chunk?: number,
  ): ReadableStream<[candidates: (Candidate & MatchInfo)[], progress: number]>;
}

export interface RemoteLike extends Pick<SearchWorkerAPI, "load" | "search"> {
  [releaseProxy](): void;
}

/** 中断可能な検索 */
export const makeCancelableSearch = (
  endpoint: Worker | MessagePort,
): CancelableSearch => {
  const worker = wrap<SearchWorkerAPI>(endpoint);

  return {
    load: async (projects) => {
      logger.debug("start loading source");
      const candidateCount = await worker.load([...projects]);
      logger.debug(`loaded ${candidateCount} candidates`);
      return candidateCount;
    },

    search: (query, chunk) => search(query, chunk ?? 5000, worker.search),

    [Symbol.dispose]: () => {
      worker[releaseProxy]();
      if (endpoint instanceof MessagePort) {
        endpoint.close();
      } else {
        endpoint.terminate();
      }
      console.debug("shared worker closed.");
      logger.debug("shared worker closed.");
    },
  };
};

const search = (
  query: string,
  chunk: number,
  searchFn: SearchWorkerAPI["search"],
): ReadableStream<[
  candidates: (Candidate & MatchInfo)[],
  progress: number,
]> => {
  logger.debug("start searching: ", query);
  if (!query.trim()) {
    return new ReadableStream({
      start(controller) {
        controller.close();
      },
    });
  }

  const start = new Date();
  let closed = false;

  return new ReadableStream({
    async start(controller) {
      try {
        await searchFn(
          query,
          chunk,
          proxy((candidates, progress) => {
            if (!closed) controller.enqueue([candidates, progress]);
            return closed;
          }),
        );

        controller.close();
      } catch (error) {
        controller.error(error);
      } finally {
        closed = true;
        const end = new Date();
        const ms = end.getTime() - start.getTime();
        logger.debug(
          `Comlink search completed for "${query}" in ${ms}ms`,
        );
      }
    },

    cancel() {
      // Comlink handles the cancellation automatically
      closed = true;
      const end = new Date();
      const ms = end.getTime() - start.getTime();
      logger.debug(
        `Comlink search cancelled for "${query}" after ${ms}ms`,
      );
    },
  });
};
