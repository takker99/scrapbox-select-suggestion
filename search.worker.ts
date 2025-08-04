import { delay } from "./deps/async.ts";
import { makeFilter, MatchInfo } from "./search.ts";
import { Candidate } from "./source.ts";
import { check, Diff, Link, load, subscribe } from "./deps/storage.ts";
import { toTitleLc } from "./deps/scrapbox-title.ts";
import { createDebug } from "./deps/debug.ts";
const logger = createDebug("scrapbox-select-suggestion:search.worker.ts");

export interface LoadRequest {
  type: "load";
  id: string;
  projects: string[];
}

export interface SearchRequest {
  type: "search";
  id: string;
  query: string;
  chunk: number;
}

export interface CancelRequest {
  type: "cancel";
  id: string;
}

export interface LoadProgress {
  type: "load-progress";
  id: string;
  completed: boolean;
  candidateCount: number;
}

export interface SearchProgress {
  type: "search-progress";
  id: string;
  candidates: (Candidate & MatchInfo)[];
  progress: number;
  completed: boolean;
}

export interface WorkerError {
  type: "error";
  id: string;
  error: string;
}

type WorkerRequest = LoadRequest | SearchRequest | CancelRequest;
export type WorkerResponse = LoadProgress | SearchProgress | WorkerError;

/** Store active operations to support cancellation */
const sessions = new Set<string>();

// Store loaded candidate data
let candidates: Candidate[] = [];
let loadedProjects: string[] = [];
let unsubscribe = () => {};

self.addEventListener(
  "message",
  (event: MessageEvent<WorkerRequest>) => {
    const message = event.data;

    if (message.type === "cancel") {
      // Mark operation as cancelled
      sessions.delete(message.id);
      return;
    }

    if (sessions.has(message.id)) {
      self.postMessage(
        {
          type: "error",
          id: message.id,
          error: "This id is already in use",
        } satisfies WorkerResponse,
      );
      return;
    }

    // Mark operation as active
    sessions.add(message.id);

    if (message.type === "load") {
      handleLoadRequest(message);
      return;
    }

    if (message.type === "search") {
      handleSearchRequest(message);
      return;
    }
  },
);

const handleLoadRequest = async (request: LoadRequest): Promise<void> => {
  const { id, projects } = request;

  try {
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

    // Check if operation was cancelled
    if (!sessions.has(id)) return;

    const response: LoadProgress = {
      type: "load-progress",
      id,
      completed: true,
      candidateCount: candidates.length,
    };
    self.postMessage(response);
  } catch (error) {
    const errorResponse: WorkerError = {
      type: "error",
      id,
      error: error instanceof Error ? error.message : `${error}`,
    };
    self.postMessage(errorResponse);
  } finally {
    sessions.delete(id);
  }
};

const handleSearchRequest = async (request: SearchRequest): Promise<void> => {
  const { id, query, chunk } = request;

  try {
    const filter = makeFilter<Candidate>(query);
    if (!filter) {
      // No filter needed, send empty result
      const result: SearchProgress = {
        type: "search-progress",
        id,
        candidates: [],
        progress: 1.0,
        completed: true,
      };
      self.postMessage(result);
      return;
    }

    const source = [...candidates];
    const total = Math.ceil(source.length / chunk);

    for (let i = 0; i < total; i++) {
      // Check if search was cancelled
      if (!sessions.has(id)) return;

      const progress = (i + 1) / total;
      const completed = i === total - 1;

      const result: SearchProgress = {
        type: "search-progress",
        id,
        candidates: [...filter(
          source.values().drop(i * chunk).take(chunk),
        )],
        progress,
        completed,
      };

      logger.debug(`[${id}][${i}/${total}] search result:`, result.candidates);
      self.postMessage(result);

      // Yield control to prevent blocking the worker thread
      if (!completed) await delay(0);
    }
  } catch (error) {
    const errorResponse: WorkerError = {
      type: "error",
      id,
      error: error instanceof Error ? error.message : String(error),
    };
    self.postMessage(errorResponse);
  } finally {
    // Clean up
    sessions.delete(id);
  }
};
const makeCandidate = (links: Iterable<Link>): Map<string, Candidate> => {
  const result = new Map<string, Candidate>();
  for (const link of links) {
    addLink(result, link);
  }
  return result;
};

const applyDiff = (candidates: Map<string, Candidate>, diff: Diff) => {
  const result = new Map(candidates);
  if (diff.added) {
    for (const [, link] of diff.added) {
      addLink(result, link);
    }
  }
  if (diff.updated) {
    for (const [, [before, after]] of diff.updated) {
      deleteLink(result, before);
      addLink(result, after);
    }
  }
  if (diff.deleted) {
    for (const [, link] of diff.deleted) {
      deleteLink(result, link);
    }
  }
  return result;
};

const addLink = (candidates: Map<string, Candidate>, link: Link) => {
  const titleLc = toTitleLc(link.title);
  const candidate = candidates.get(titleLc);
  if ((candidate?.updated ?? 0) > link.updated) return;

  const metadata = candidate?.metadata ??
    new Map<string, { image?: string }>();
  metadata.set(link.project, { image: link.image });
  candidates.set(titleLc, {
    title: link.title,
    titleLc,
    updated: link.updated,
    linked: candidate?.linked ?? 0,
    metadata,
  });
  for (const link_ of link.links) {
    const linkLc = toTitleLc(link_);
    const candidate = candidates.get(linkLc);
    const metadata = candidate?.metadata ??
      new Map<string, { image?: string }>();
    metadata.set(
      link.project,
      metadata.get(link.project) ?? { image: link.image },
    );
    candidates.set(linkLc, {
      title: candidate?.title ?? link_,
      titleLc: linkLc,
      updated: candidate?.updated ?? 0,
      linked: (candidate?.linked ?? 0) + 1,
      metadata,
    });
  }
};

const deleteLink = (candidates: Map<string, Candidate>, link: Link) => {
  const titleLc = toTitleLc(link.title);
  const candidate = candidates.get(titleLc);
  if (!candidate || (candidate.updated ?? 0) > link.updated) return;

  const metadata = candidate.metadata;
  metadata.delete(link.project);
  if (metadata.size <= 0) {
    candidates.delete(titleLc);
  } else {
    candidates.set(titleLc, {
      title: candidate.title,
      titleLc,
      updated: link.updated,
      linked: candidate.linked,
      metadata,
    });
  }
  for (const link_ of link.links) {
    const linkLc = toTitleLc(link_);
    const candidate = candidates.get(linkLc);
    if (!candidate) continue;
    const metadata = candidate.metadata;
    metadata.delete(link.project);
    if (metadata.size <= 0) {
      candidates.delete(linkLc);
    } else {
      candidates.set(linkLc, {
        title: candidate.title,
        titleLc: linkLc,
        updated: link.updated,
        linked: candidate.linked - 1,
        metadata,
      });
    }
  }
};

const arraysEqual = (a: string[], b: string[]): boolean => {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((val, index) => val === sortedB[index]);
};
