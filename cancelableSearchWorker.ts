import type { Candidate } from "./source.ts";
import type { MatchInfo } from "./search.ts";

export interface CancelableSearchOptions {
  /** 一度に検索する候補の最大数
   *
   * @default 1000
   */
  chunk?: number;
}

// Create a Web Worker that can run the search logic
// This creates a blob URL to avoid file dependency issues
const createSearchWorker = () => {
  const workerCode = `
    // Web Worker code for search functionality
    
    // Simple fallback for revertTitleLc - replaces underscores with spaces
    const revertTitleLc = (text) => text.replace(/_/g, " ");

    // Bit DP implementation
    const bitDP = (query) => {
      const Peq = new Map();
      const rquery = [...query].reverse();
      let i = 1;
      for (const q of rquery) {
        Peq.set(q, (Peq.get(q) ?? 0) | i);
        const pil = q.toLowerCase();
        Peq.set(pil, (Peq.get(pil) ?? 0) | i);
        const piu = q.toUpperCase();
        Peq.set(piu, (Peq.get(piu) ?? 0) | i);
        i <<= 1;
      }

      const m = rquery.length;
      const Pv0 = ~(~(0) << m);
      const accept = 1 << (m - 1);

      return (text) => {
        let Mv = 0;
        let Pv = Pv0;
        const rtext = [...text].reverse();
        const Cm = [];
        let j = rtext.length;
        Cm[j] = m;

        for (const t of rtext) {
          const Eq = Peq.get(t) ?? 0;
          const Xv = Eq | Mv;
          const Xh = (((Eq & Pv) + Pv) ^ Pv) | Eq;
          const Ph = Mv | ~(Xh | Pv);
          const Mh = Pv & Xh;
          Cm[j - 1] = Cm[j] +
            ((Ph & accept) !== 0 ? 1 : (Mh & accept) !== 0 ? -1 : 0);

          Pv = (Mh << 1) | ~(Xv | (Ph << 1));
          Mv = (Ph << 1) & Xv;
          j--;
        }

        return Cm;
      };
    };

    // Max distance calculation
    const getMaxDistance = [
      0, 0, 0,
      1, 1,
      2, 2, 2, 2,
      3, 3, 3, 3, 3, 3,
      4, 4, 4, 4, 4, 4, 4, 4, 4, 4,
      5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5,
      6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6,
    ];

    const makeFilter = (query) => {
      const queries = revertTitleLc(query.trim()).split(/\\s+/)
        .sort((a, b) => b.length - a.length);
      if (queries.length === 0 || queries.every((q) => q === "")) return;

      return (source) => {
        let result = [...source];
        for (const query of queries) {
          result = filter(query, result);
        }
        return result;
      };
    };

    const filter = (query, source) => {
      const m = [...query].length;
      const maxDistance = getMaxDistance[m] || 6;
      const filter_ = bitDP(query);

      return source.flatMap(({ title, dist, matches, ...props }) => {
        matches = matches || [];
        dist = dist || 0;

        const result = filter_(title)
          .flatMap((d, i) =>
            d <= maxDistance &&
            matches.every(([s, e]) => i + m <= s || e < i)
              ? [[i, d]]
              : []
          );
        if (result.length === 0) return [];

        const newMatch = result.reduce((prev, [i, dist]) => {
          if (prev.dist <= dist) return prev;
          prev.dist = dist;
          prev.start = i;
          return prev;
        }, { dist: m, start: 0 });

        matches.push([newMatch.start, newMatch.start + m - 1]);
        return [
          {
            title,
            dist: newMatch.dist + dist,
            matches,
            ...props,
          },
        ];
      });
    };

    // Message handling
    let currentSearchId = null;
    let shouldAbort = false;

    self.addEventListener("message", async (event) => {
      const { id, query, source, chunk } = event.data;

      if (currentSearchId && currentSearchId !== id) {
        shouldAbort = true;
      }

      currentSearchId = id;
      shouldAbort = false;

      try {
        const filter = makeFilter(query);
        if (!filter) {
          self.postMessage({ id, type: "complete" });
          return;
        }

        const total = Math.floor(source.length / chunk) + 1;
        let processedChunks = 0;

        for (let i = 0; i < total; i++) {
          if (shouldAbort && currentSearchId !== id) {
            return;
          }

          const chunkStart = i * chunk;
          const chunkEnd = (i + 1) * chunk;
          const chunkData = source.slice(chunkStart, chunkEnd);
          
          const candidates = filter(chunkData);
          processedChunks++;
          
          const progress = processedChunks / total;

          self.postMessage({
            id,
            type: "progress",
            candidates,
            progress,
          });

          await new Promise((resolve) => setTimeout(resolve, 0));
        }

        self.postMessage({ id, type: "complete" });
      } catch (error) {
        self.postMessage({
          id,
          type: "error",
          error: error.message || String(error),
        });
      }
    });
  `;

  const blob = new Blob([workerCode], { type: 'application/javascript' });
  return new Worker(URL.createObjectURL(blob));
};

/** Web Worker based cancelable search */
export async function* cancelableSearchWorker<Item extends Candidate>(
  query: string,
  source: Item[],
  options?: CancelableSearchOptions,
): AsyncGenerator<[(Item & MatchInfo)[], number], void, unknown> {
  const chunk = options?.chunk ?? 1000;
  const searchId = crypto.randomUUID();
  
  const worker = createSearchWorker();
  
  let aborted = false;
  const results: Array<[(Item & MatchInfo)[], number]> = [];
  let completed = false;
  let error: Error | null = null;

  // Set up message handling
  worker.addEventListener("message", (event) => {
    const response = event.data;
    
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
    worker.terminate();
  }
}