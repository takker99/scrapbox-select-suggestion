import { delay } from "./deps/async.ts";
import { Candidate, makeFilter, MatchInfo } from "./search.ts";

export interface SearchRequest<Item extends Candidate> {
  id: string;
  query: string;
  source: Item[];
  chunk: number;
}

export interface SearchProgress<Item extends Candidate> {
  id: string;
  candidates: (Item & MatchInfo)[];
  progress: number;
  completed: boolean;
}

export interface SearchError {
  id: string;
  error: string;
}

// Store active search operations to support cancellation
const activeSearches = new Map<string, boolean>();

self.addEventListener(
  "message",
  (
    event: MessageEvent<
      SearchRequest<Candidate> | { type: "cancel"; id: string }
    >,
  ) => {
    const message = event.data;

    if ("type" in message && message.type === "cancel") {
      // Mark search as cancelled
      activeSearches.set(message.id, false);
      return;
    }

    // Type guard: message is SearchRequest at this point
    const searchRequest = message as SearchRequest<Candidate>;
    const { id, query, source, chunk } = searchRequest;

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
  },
);

const performSearch = async <Item extends Candidate>(
  id: string,
  query: string,
  source: Item[],
  chunk: number,
): Promise<void> => {
  const filter = makeFilter<Item>(query);
  if (!filter) {
    // No filter needed, send empty result
    const result: SearchProgress<Item> = {
      id,
      candidates: [],
      progress: 1.0,
      completed: true,
    };
    self.postMessage(result);
    return;
  }

  const total = Math.ceil(source.length / chunk);
  let allCandidates: (Item & MatchInfo)[] = [];

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

    const result: SearchProgress<Item> = {
      id,
      candidates: allCandidates,
      progress,
      completed,
    };

    self.postMessage(result);

    // Yield control to prevent blocking the worker thread
    if (!completed) await delay(0);
  }

  // Clean up
  activeSearches.delete(id);
};
