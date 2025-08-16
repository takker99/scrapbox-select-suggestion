import { arraysEqual } from "./arraysEqual.ts";
import { delay } from "./deps/async.ts";
import { expose } from "./deps/comlink.ts";
import { createDebug } from "./deps/debug.ts";
import { check, load, subscribe } from "./deps/storage.ts";
import { makeFilter, type MatchInfo } from "./search.ts";
import { applyDiff, type Candidate, makeCandidate } from "./source.ts";

const logger = createDebug("scrapbox-select-suggestion:search.worker.ts");

// Store loaded candidate data
let candidates: Candidate[] = [];
let loadedProjects: string[] = [];
let unsubscribe = () => {};

/** Worker API exposed through Comlink */
export interface SearchWorkerAPI {
  load(projects: string[]): Promise<number>;
  search(
    query: string,
    chunk: number,
    onProgress: (
      candidates: (Candidate & MatchInfo)[],
      progress: number,
    ) => void,
  ): Promise<void>;
}

const searchWorkerAPI: SearchWorkerAPI = {
  async load(projects: string[]): Promise<number> {
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

  async search(
    query: string,
    chunk: number,
    onProgress: (
      candidates: (Candidate & MatchInfo)[],
      progress: number,
    ) => void,
  ): Promise<void> {
    logger.debug("start searching: ", query);

    if (!query.trim()) {
      return;
    }

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
      const completed = i === total - 1;

      const searchCandidates = [...filter(
        source.values().drop(i * chunk).take(chunk),
      )];

      logger.debug(`[${i}/${total}] search result:`, searchCandidates);
      onProgress(searchCandidates, progress);

      // Yield control to prevent blocking the worker thread
      if (!completed) await delay(0);
    }
  },
};

// Check if we're running as a SharedWorker or regular Worker
interface SharedWorkerGlobalScopeInterface {
  addEventListener: (
    type: string,
    listener: (event: MessageEvent) => void,
  ) => void;
}

declare const SharedWorkerGlobalScope: {
  new (): SharedWorkerGlobalScopeInterface;
} | undefined;

if (
  typeof SharedWorkerGlobalScope !== "undefined" &&
  self instanceof SharedWorkerGlobalScope
) {
  // SharedWorker mode
  (self as SharedWorkerGlobalScopeInterface).addEventListener(
    "connect",
    (event: MessageEvent) => {
      const port = event.ports[0];
      expose(searchWorkerAPI, port);
    },
  );
} else {
  // Regular Worker mode
  expose(searchWorkerAPI);
}
