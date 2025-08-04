import { MatchInfo } from "./search.ts";
import { Candidate } from "./source.ts";
import { createDebug } from "./deps/debug.ts";
import type {
  LoadProgress,
  LoadRequest,
  SearchProgress,
  SearchRequest,
  WorkerError,
} from "./search.worker.ts";

const logger = createDebug("scrapbox-select-suggestion:cancelableSearch.ts");

// Generate unique ID for each search operation
let searchIdCounter = 0;
const generateSearchId = (): string =>
  `search_${++searchIdCounter}_${Date.now()}`;

export interface CancelableSearch extends Disposable {
  /** データを読み込む
   *
   * @param projects 読み込み対象のプロジェクトリスト
   */
  load(projects: Iterable<string>): Promise<void>;

  /** 中断可能な検索を開始する
   *
   * @param query 検索クエリ
   * @param [chunk=5000] 一度に検索する候補の最大数
   */
  search(
    query: string,
    chunk?: number,
  ): AsyncGenerator<[(Candidate & MatchInfo)[], number], void, unknown>;
}

/** 中断可能な検索 */
export const makeCancelableSearch = (
  workerUrl: string | URL,
): CancelableSearch => {
  const worker = new Worker(workerUrl, { type: "module" });

  return {
    load: (projects) => load(projects, worker),

    async *search(query, chunk) {
      yield* search(query, chunk ?? 5000, worker);
    },

    [Symbol.dispose]: () => {
      worker.terminate();
      logger.debug("worker terminated.");
    },
  };
};

const load = async (
  projects: Iterable<string>,
  worker: Worker,
): Promise<void> => {
  logger.debug("start loading source");
  const loadId = generateSearchId();

  const loadRequest: LoadRequest = {
    type: "load",
    id: loadId,
    projects: [...projects],
  };

  logger.time(
    `Sending load request for projects: ${loadRequest.projects.join(", ")}`,
  );
  worker.postMessage(loadRequest);
  logger.timeEnd(
    `Sending load request for projects: ${loadRequest.projects.join(", ")}`,
  );

  // Wait for load completion
  const message = await new Promise<LoadProgress | WorkerError>(
    (resolve, reject) => {
      const messageHandler = (
        event: MessageEvent<LoadProgress | WorkerError>,
      ) => {
        const data = event.data;
        if (data.id === loadId) {
          worker.removeEventListener("message", messageHandler);
          worker.removeEventListener("error", errorHandler);
          resolve(data);
        }
      };

      const errorHandler = (event: ErrorEvent) => {
        worker.removeEventListener("message", messageHandler);
        worker.removeEventListener("error", errorHandler);
        reject(new Error(`Worker error: ${event.message}`));
      };

      worker.addEventListener("message", messageHandler);
      worker.addEventListener("error", errorHandler);
    },
  );

  if (message.type === "error") {
    throw new Error(message.error);
  }

  logger.debug(`Data loaded: ${message.candidateCount} candidates`);
};

async function* search(
  query: string,
  chunk: number,
  worker: Worker,
): AsyncGenerator<[(Candidate & MatchInfo)[], number], void, unknown> {
  logger.debug("start searching: ", query);
  if (!query.trim()) return;

  const searchId = generateSearchId();
  const start = new Date();
  let completed = false;
  let aborted = false;

  const searchRequest: SearchRequest = {
    type: "search",
    id: searchId,
    query,
    chunk,
  };

  logger.time(`Sending search request for "${query}"`);
  worker.postMessage(searchRequest);
  logger.timeEnd(`Sending search request for "${query}"`);

  try {
    // Listen for results and yield them
    while (!completed && !aborted) {
      logger.time(`Waiting for results for search ID: ${searchId}`);
      const message = await new Promise<SearchProgress | WorkerError>(
        (resolve, reject) => {
          const messageHandler = (
            event: MessageEvent<SearchProgress | WorkerError>,
          ) => {
            const data = event.data;
            if (data.id === searchId) {
              worker.removeEventListener("message", messageHandler);
              worker.removeEventListener("error", errorHandler);
              resolve(data);
            }
          };

          const errorHandler = (event: ErrorEvent) => {
            worker.removeEventListener("message", messageHandler);
            worker.removeEventListener("error", errorHandler);
            reject(new Error(`Worker error: ${event.message}`));
          };

          worker.addEventListener("message", messageHandler);
          worker.addEventListener("error", errorHandler);
        },
      );
      logger.timeEnd(`Waiting for results for search ID: ${searchId}`);

      if (aborted) break;

      if (message.type === "error") {
        throw new Error(message.error);
      }

      const progress = message.progress;
      const candidates = message.candidates as (Candidate & MatchInfo)[];
      completed = message.completed;

      yield [candidates, progress];
    }
  } finally {
    aborted = true;
    const end = new Date();
    const ms = end.getTime() - start.getTime();
    logger.debug(
      `WebWorker search completed for "${query}" in ${ms}ms`,
    );
  }
}
