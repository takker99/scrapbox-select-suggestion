import { MatchInfo } from "./search.ts";
import { Candidate } from "./source.ts";
import { createDebug } from "./deps/debug.ts";
import { SharedWorker } from "./deps/sharedworker.ts";
import { releaseProxy, wrap } from "./deps/comlink.ts";
import type { Remote } from "./deps/comlink.ts";
import type { SearchWorkerAPI } from "./search.worker.ts";

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

/** 中断可能な検索 */
export const makeCancelableSearch = (
  workerUrl: string | URL,
): CancelableSearch => {
  const sharedWorker = new SharedWorker(workerUrl, { type: "module" });
  const worker = wrap<SearchWorkerAPI>(sharedWorker.port);

  return {
    load: async (projects) => {
      logger.debug("start loading source");
      const candidateCount = await worker.load([...projects]);
      logger.debug(`loaded ${candidateCount} candidates`);
      return candidateCount;
    },

    search: (query, chunk) => search(query, chunk ?? 5000, worker),

    [Symbol.dispose]: () => {
      worker[releaseProxy]();
      if (
        typeof (sharedWorker as unknown as { close?: () => void }).close ===
          "function"
      ) {
        (sharedWorker as unknown as { close: () => void }).close();
      } else {
        sharedWorker.port.close();
      }
      logger.debug("shared worker closed.");
    },
  };
};

const search = (
  query: string,
  chunk: number,
  worker: Remote<SearchWorkerAPI>,
): ReadableStream<
  [candidates: (Candidate & MatchInfo)[], progress: number]
> => {
  logger.debug("start searching: ", query);
  if (!query.trim()) {
    return new ReadableStream({
      start(controller) {
        controller.close();
      },
    });
  }

  const start = new Date();

  return new ReadableStream({
    async start(controller) {
      try {
        await worker.search(query, chunk, (candidates, progress) => {
          controller.enqueue([candidates, progress]);
        });

        controller.close();
      } catch (error) {
        controller.error(error);
      } finally {
        const end = new Date();
        const ms = end.getTime() - start.getTime();
        logger.debug(
          `Comlink search completed for "${query}" in ${ms}ms`,
        );
      }
    },

    cancel() {
      // Comlink handles the cancellation automatically
      const end = new Date();
      const ms = end.getTime() - start.getTime();
      logger.debug(
        `Comlink search cancelled for "${query}" after ${ms}ms`,
      );
    },
  });
};
