import type { MatchInfo } from "./search.ts";
import type { Candidate } from "./source.ts";
import { createDebug } from "./deps/debug.ts";
import { SharedWorker } from "./deps/sharedworker.ts";
import { releaseProxy, wrap } from "./deps/comlink.ts";
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
export interface CancelableSearchOptions {
  /**
   * Comlink Remote を差し替えるための factory。
   * テストで副作用(実ワーカー起動)を避けるために使用。
   */
  workerFactory?: (url: string | URL) => {
    load(projects: string[]): Promise<number>;
    search(
      query: string,
      chunk: number,
      onProgress: (
        candidates: (Candidate & MatchInfo)[],
        progress: number,
      ) => void,
    ): Promise<void>;
    [releaseProxy](): void;
  };
  /**
   * SharedWorker の生成を差し替え。通常は不要。`workerFactory` だけ指定した場合も
   * 実ワーカー生成を避けたいならこちらを no-op 実装で与える。
   */
  sharedWorkerFactory?: (
    url: string | URL,
  ) => { port: MessagePort; close?: () => void };
}

export const makeCancelableSearch = (
  workerUrl: string | URL,
  options?: CancelableSearchOptions,
): CancelableSearch => {
  const sharedWorker = options?.sharedWorkerFactory?.(workerUrl) ??
    new SharedWorker(workerUrl, { type: "module" });
  const worker = options?.workerFactory?.(workerUrl) ??
    wrap<SearchWorkerAPI>(sharedWorker.port);

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

type MinimalWorker = {
  search(
    query: string,
    chunk: number,
    onProgress: (
      candidates: (Candidate & MatchInfo)[],
      progress: number,
    ) => void,
  ): Promise<void>;
};

const search = (
  query: string,
  chunk: number,
  worker: MinimalWorker,
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
