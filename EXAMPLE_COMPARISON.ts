/**
 * Example: Before and After comparison
 * 
 * This example shows how the search implementation changed
 * from requestAnimationFrame to Web Worker.
 */

// ===== BEFORE (Old Implementation) =====
/*
export async function* cancelableSearchOld<Item extends Candidate>(
  query: string,
  source: Item[],
  options?: CancelableSearchOptions,
): AsyncGenerator<[(Item & MatchInfo)[], number], void, unknown> {
  const filter = makeFilter<Item>(query);
  if (!filter) return;

  const chunk = options?.chunk ?? 1000;
  const total = Math.floor(source.length / chunk) + 1;
  
  for (let i = 0; i < total; i++) {
    // 🚨 Problem: Limited by frame rate, still blocks UI
    await new Promise((resolve) => requestAnimationFrame(resolve));
    yield [filter(source.slice(i * chunk, (i + 1) * chunk)), (i + 1) / total];
  }
}
*/

// ===== AFTER (New Implementation) =====

// 1. Improved main thread fallback
export async function* cancelableSearch<Item extends Candidate>(
  query: string,
  source: Item[],
  options?: CancelableSearchOptions,
): AsyncGenerator<[(Item & MatchInfo)[], number], void, unknown> {
  // ... filter setup ...

  for (let i = 0; i < total; i++) {
    // ✅ Better yielding with setTimeout(0)
    if (i % 1 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    
    const chunkData = source.slice(i * chunk, (i + 1) * chunk);
    const results = filter(chunkData);
    yield [results, (i + 1) / total];
  }
}

// 2. Web Worker implementation (completely off main thread)
export async function* cancelableSearchWorker<Item extends Candidate>(
  query: string,
  source: Item[],
  options?: CancelableSearchOptions,
): AsyncGenerator<[(Item & MatchInfo)[], number], void, unknown> {
  // ✅ Creates Web Worker with embedded search logic
  const worker = createSearchWorker();
  
  // ✅ All computation happens off main thread
  worker.postMessage({ id: searchId, query, source, chunk });
  
  // ✅ Progress updates via postMessage
  while (!completed && !aborted) {
    // Yield results as they come from worker
    while (lastYieldedIndex < results.length) {
      yield results[lastYieldedIndex];
      lastYieldedIndex++;
    }
  }
}

// 3. Automatic selection with feature detection
const useSearchWithWorker = (initialSource: Candidate[]) => {
  const executeSearch: Searcher = useCallback((query, source, executedBySourceUpdate) => {
    // ✅ Automatic feature detection and fallback
    const supportsWorkers = typeof Worker !== 'undefined';
    const searchFunction = supportsWorkers ? cancelableSearchWorker : cancelableSearch;
    
    const iterator = searchFunction(query, source, { chunk: 5000 });
    // ... rest of implementation unchanged
  }, []);
  
  // ... rest unchanged
};

// ===== USAGE (No Changes Required) =====
/*
// Code using the search remains exactly the same:
const [searchResult, { search, update }] = useSearch(initialData);

search("some query"); // Now uses Web Worker automatically if available!

// Benefits:
// 🚀 UI never freezes during search
// 📈 Better performance on large datasets  
// 🔄 Automatic fallback for compatibility
// 🛡️ Zero breaking changes to existing code
*/

export { };