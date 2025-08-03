import { Candidate, makeFilter, MatchInfo } from "./search.ts";
import { createDebug } from "./deps/debug.ts";
import type { SearchRequest, SearchProgress, SearchError } from "./search.worker.ts";

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
  workerUrl?: string;
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
  options?: CancelableSearchOptions,
): AsyncGenerator<[(Item & MatchInfo)[], number], void, unknown> {
  if (!query.trim()) return;

  const chunk = options?.chunk ?? 1000;
  const workerUrl = options?.workerUrl;
  
  // Fallback to original implementation if no worker URL is provided
  if (!workerUrl) {
    yield* cancelableSearchFallback(query, source, { chunk });
    return;
  }

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
    const abortController = {
      abort: () => {
        aborted = true;
        if (worker && !completed) {
          worker.postMessage({ type: "cancel", id: searchId });
        }
      }
    };
    
    // Listen for results and yield them
    while (!completed && !aborted) {
      const message = await new Promise<SearchProgress | SearchError>((resolve, reject) => {
        const messageHandler = (event: MessageEvent<SearchProgress | SearchError>) => {
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
      });
      
      if (aborted) break;
      
      if ("error" in message) {
        throw new Error(message.error);
      }
      
      const progress = message.progress;
      const candidates = message.candidates as (Item & MatchInfo)[];
      completed = message.completed;
      
      yield [candidates, progress];
    }
    
  } catch (error) {
    logger.error("WebWorker search failed, falling back to main thread:", error);
    yield* cancelableSearchFallback(query, source, { chunk });
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

/** Fallback implementation using the original requestAnimationFrame approach */
async function* cancelableSearchFallback<Item extends Candidate>(
  query: string,
  source: Item[],
  options?: { chunk?: number },
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
      `Fallback search ${
        (i / total * 100).toPrecision(3)
      }% of the source for "${query}" in ${ms}ms`,
    );
  }
}
