import { Candidate, makeFilter, MatchInfo } from "./search.ts";

export interface SearchRequest {
  id: string;
  query: string;
  source: Candidate[];
  chunk: number;
}

export interface SearchProgress {
  id: string;
  candidates: (Candidate & MatchInfo)[];
  progress: number;
  completed: boolean;
}

export interface SearchError {
  id: string;
  error: string;
}

// Store active search operations to support cancellation
const activeSearches = new Map<string, boolean>();

self.addEventListener("message", (event: MessageEvent<SearchRequest | { type: "cancel"; id: string }>) => {
  const message = event.data;
  
  if ("type" in message && message.type === "cancel") {
    // Mark search as cancelled
    activeSearches.set(message.id, false);
    return;
  }

  const { id, query, source, chunk } = message;
  
  // Mark search as active
  activeSearches.set(id, true);
  
  try {
    performSearch(id, query, source, chunk);
  } catch (error) {
    const errorMessage: SearchError = {
      id,
      error: error instanceof Error ? error.message : String(error),
    };
    self.postMessage(errorMessage);
  }
});

async function performSearch(
  id: string,
  query: string,
  source: Candidate[],
  chunk: number,
): Promise<void> {
  const filter = makeFilter<Candidate>(query);
  if (!filter) {
    // No filter needed, send empty result
    const result: SearchProgress = {
      id,
      candidates: [],
      progress: 1.0,
      completed: true,
    };
    self.postMessage(result);
    return;
  }

  const total = Math.ceil(source.length / chunk);
  let allCandidates: (Candidate & MatchInfo)[] = [];
  
  for (let i = 0; i < total; i++) {
    // Check if search was cancelled
    if (!activeSearches.get(id)) {
      activeSearches.delete(id);
      return;
    }

    const startIndex = i * chunk;
    const endIndex = Math.min((i + 1) * chunk, source.length);
    const chunkSource = source.slice(startIndex, endIndex);
    
    const chunkResults = filter(chunkSource);
    allCandidates = [...allCandidates, ...chunkResults];
    
    const progress = (i + 1) / total;
    const completed = i === total - 1;
    
    const result: SearchProgress = {
      id,
      candidates: allCandidates,
      progress,
      completed,
    };
    
    self.postMessage(result);
    
    // Yield control to prevent blocking the worker thread
    if (!completed) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
  
  // Clean up
  activeSearches.delete(id);
}