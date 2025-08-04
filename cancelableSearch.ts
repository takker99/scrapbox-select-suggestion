import { Candidate, MatchInfo } from "./search.ts";
import { createDebug } from "./deps/debug.ts";
import type {
  SearchError,
  SearchProgress,
  SearchRequest,
} from "./search.worker.ts";

const logger = createDebug("scrapbox-select-suggestion:cancelableSearch.ts");

// Generate unique ID for each search operation
let searchIdCounter = 0;
const generateSearchId = (): string =>
  `search_${++searchIdCounter}_${Date.now()}`;

export interface CancelableSearch<Item extends Candidate> extends Disposable {
  /** 中断可能な検索を開始する
   *
   * @param query 検索クエリ
   * @param source 検索対象の候補リスト
   * @param [chunk=1000] 一度に検索する候補の最大数
   */
  (
    query: string,
    source: Item[],
    chunk?: number,
  ): AsyncGenerator<[(Item & MatchInfo)[], number], void, unknown>;
}

/** 中断可能な検索 */
export const makeCancelableSearch = <Item extends Candidate>(
  workerUrl: string | URL,
): CancelableSearch<Item> => {
  const worker = new Worker(workerUrl, { type: "module" });

  const search_: CancelableSearch<Item> = async function* (
    query,
    source,
    chunk,
  ) {
    return yield* search(query, source, chunk ?? 1000, worker);
  };
  search_[Symbol.dispose] = () => worker.terminate();

  return search_;
};

async function* search<Item extends Candidate>(
  query: string,
  source: Item[],
  chunk: number,
  worker: Worker,
): AsyncGenerator<[(Item & MatchInfo)[], number], void, unknown> {
  if (!query.trim()) return;

  const searchId = generateSearchId();
  const start = new Date();
  let completed = false;
  let aborted = false;

  const searchRequest: SearchRequest<Item> = {
    id: searchId,
    query,
    source,
    chunk,
  };

  logger.time(`Sending search request for "${query}"`);
  worker.postMessage(searchRequest);
  logger.timeEnd(`Sending search request for "${query}"`);

  try {
    // Listen for results and yield them
    while (!completed && !aborted) {
      logger.time(`Waiting for results for search ID: ${searchId}`);
      const message = await new Promise<SearchProgress<Item> | SearchError>(
        (resolve, reject) => {
          const messageHandler = (
            event: MessageEvent<SearchProgress<Item> | SearchError>,
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

      if ("error" in message) {
        throw new Error(message.error);
      }

      const progress = message.progress;
      const candidates = message.candidates as (Item & MatchInfo)[];
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
