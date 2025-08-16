import { arraysEqual } from "../arraysEqual.ts";
import { delay } from "../deps/async.ts";
import { expose } from "../deps/comlink.ts";
import { createDebug } from "../deps/debug.ts";
import { check, load, subscribe } from "../deps/storage.ts";
import { makeFilter } from "../search.ts";
import { applyDiff, type Candidate, makeCandidate } from "../source.ts";
import type { SearchWorkerAPI } from "../worker-endpoint.ts";

const logger = createDebug("scrapbox-select-suggestion:search.worker.ts");

// Store loaded candidate data
let candidates: Candidate[] = [];
let loadedProjects: string[] = [];
let unsubscribe = () => {};

const searchWorkerAPI: SearchWorkerAPI = {
  async load(projects) {
    logger.debug("start loading source");

    // Check if we need to reload data
    const projectsChanged = !arraysEqual(loadedProjects, projects);

    if (projectsChanged) {
      loadedProjects = [...projects];
      unsubscribe();

      // Load initial data
      const links = await load(projects);
      let candidateMap = makeCandidate(links);
      candidates = [...candidateMap.values()];

      // Set up subscription for updates
      await check(projects, 600);
      unsubscribe = subscribe(projects, ({ diff }) => {
        candidateMap = applyDiff(candidateMap, diff);
        candidates = [...candidateMap.values()];
      });
    }

    return candidates.length;
  },

  async search(query, chunk, onProgress) {
    logger.debug("start searching: ", query);

    if (!query.trim()) return;

    const filter = makeFilter<Candidate>(query);
    if (!filter) {
      // No filter needed, send empty result
      onProgress([], 1.0);
      return;
    }

    const source = [...candidates];
    const total = Math.ceil(source.length / chunk);

    for (let i = 0; i < total; i++) {
      const progress = (i + 1) / total;

      const searchCandidates = [...filter(
        source.values().drop(i * chunk).take(chunk),
      )];

      logger.debug(`[${i}/${total}] search result:`, searchCandidates);
      const aborted = onProgress(searchCandidates, progress);
      if (aborted) return;

      // Yield control to prevent blocking the worker thread
      await delay(0);
    }
  },
};

const isSharedWorkerGlobalScope = (
  scope: unknown,
): scope is SharedWorkerGlobalScope =>
  typeof scope === "object" && !!scope && "SharedWorkerGlobalScope" in scope;

if (isSharedWorkerGlobalScope(self)) {
  // SharedWorker mode
  (self as SharedWorkerGlobalScope).addEventListener(
    "connect",
    (event) => expose(searchWorkerAPI, event.ports[0]),
  );
} else {
  // Regular Worker mode
  expose(searchWorkerAPI);
}
