import { Candidate, MatchInfo } from "./search.ts";
import { createDebug } from "./deps/debug.ts";
import type {
  SearchError,
  SearchProgress,
  SearchRequest,
} from "./search.worker.ts";

const logger = createDebug("scrapbox-select-suggestion:cancelableSearch.ts");

export interface CancelableSearchOptions {
  /** 一度に検索する候補の最大数
   *
   * @default 1000
   */
  chunk?: number;

  /** WebWorkerのスクリプトURL
   *
   * bundleされたworkerファイルのURLを指定する
   */
  workerUrl: string;
}

// Generate unique ID for each search operation
let searchIdCounter = 0;
function generateSearchId(): string {
  return `search_${++searchIdCounter}_${Date.now()}`;
}

/** 中断可能な検索 */
export async function* cancelableSearch<Item extends Candidate>(
  query: string,
  source: Item[],
  options: CancelableSearchOptions,
): AsyncGenerator<[(Item & MatchInfo)[], number], void, unknown> {
  if (!query.trim()) return;

  const chunk = options.chunk ?? 1000;
  const workerUrl = options.workerUrl;

  const searchId = generateSearchId();
  const start = new Date();
  let worker: Worker | undefined;
  let completed = false;
  let aborted = false;

  try {
    worker = new Worker(workerUrl, { type: "module" });

    const searchRequest: SearchRequest = {
      id: searchId,
      query,
      source: source as Candidate[],
      chunk,
    };

    worker.postMessage(searchRequest);

    // Set up abortion mechanism
    const _abortController = {
      abort: () => {
        aborted = true;
        if (worker && !completed) {
          worker.postMessage({ type: "cancel", id: searchId });
        }
      },
    };

    // Listen for results and yield them
    while (!completed && !aborted) {
      const message = await new Promise<SearchProgress | SearchError>(
        (resolve, reject) => {
          const messageHandler = (
            event: MessageEvent<SearchProgress | SearchError>,
          ) => {
            const data = event.data;
            if (data.id === searchId) {
              worker!.removeEventListener("message", messageHandler);
              worker!.removeEventListener("error", errorHandler);
              resolve(data);
            }
          };

          const errorHandler = (event: ErrorEvent) => {
            worker!.removeEventListener("message", messageHandler);
            worker!.removeEventListener("error", errorHandler);
            reject(new Error(`Worker error: ${event.message}`));
          };

          worker!.addEventListener("message", messageHandler);
          worker!.addEventListener("error", errorHandler);
        },
      );

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
    if (worker) {
      worker.terminate();
    }

    const end = new Date();
    const ms = end.getTime() - start.getTime();
    logger.debug(
      `WebWorker search completed for "${query}" in ${ms}ms`,
    );
  }
}
