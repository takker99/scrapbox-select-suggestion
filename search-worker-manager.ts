import type { MatchInfo } from "./search.ts";

interface Candidate {
  title: string;
  titleLc: string;
  updated: number;
  linked: number;
  metadata: Map<string, { image?: string }>;
}

export interface CancelableSearchOptions {
  /** 一度に検索する候補の最大数
   *
   * @default 1000
   */
  chunk?: number;
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

/** Web Worker based cancelable search */
export async function* cancelableSearchWorker<Item extends Candidate>(
  query: string,
  source: Item[],
  options?: CancelableSearchOptions,
): AsyncGenerator<[(Item & MatchInfo)[], number], void, unknown> {
  const chunk = options?.chunk ?? 1000;
  const searchId = crypto.randomUUID();
  
  // Create worker from the search-worker.ts file
  const workerUrl = new URL("./search-worker.ts", import.meta.url);
  const worker = new Worker(workerUrl, { type: "module" });
  
  let aborted = false;
  const results: Array<[(Item & MatchInfo)[], number]> = [];
  let completed = false;
  let error: Error | null = null;

  // Set up message handling
  worker.addEventListener("message", (event) => {
    const response: SearchResponse = event.data;
    
    if (response.id !== searchId) return;
    
    switch (response.type) {
      case "progress":
        results.push([response.candidates as (Item & MatchInfo)[], response.progress]);
        break;
      case "complete":
        completed = true;
        break;
      case "error":
        error = new Error(response.error);
        completed = true;
        break;
    }
  });

  // Set up error handling
  worker.addEventListener("error", (event) => {
    error = new Error(`Worker error: ${event.message}`);
    completed = true;
  });

  // Start the search
  worker.postMessage({
    id: searchId,
    query,
    source,
    chunk,
  });

  try {
    // Yield results as they come in
    let lastYieldedIndex = 0;
    
    while (!completed && !aborted) {
      // Wait for new results or completion
      while (results.length === lastYieldedIndex && !completed && !aborted) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      
      if (aborted) break;
      if (error) throw error;
      
      // Yield any new results
      while (lastYieldedIndex < results.length) {
        yield results[lastYieldedIndex];
        lastYieldedIndex++;
      }
    }
  } finally {
    // Clean up worker
    if (!aborted) {
      worker.postMessage({ type: "abort", id: searchId });
    }
    worker.terminate();
  }
}