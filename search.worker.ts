import { delay } from "./deps/async.ts";
import { makeFilter, MatchInfo } from "./search.ts";
import { Candidate } from "./source.ts";
import { check, Diff, Link, load, subscribe } from "./deps/storage.ts";
import { toTitleLc } from "./deps/scrapbox-title.ts";
import { createDebug } from "./deps/debug.ts";
import * as Comlink from "./deps/comlink.ts";

const logger = createDebug("scrapbox-select-suggestion:search.worker.ts");

// Store loaded candidate data
let candidates: Candidate[] = [];
let loadedProjects: string[] = [];
let unsubscribe = () => {};

/** Worker API exposed through Comlink */
export interface SearchWorkerAPI {
  load(projects: string[]): Promise<number>;
  search(query: string, chunk: number): Promise<Array<[candidates: (Candidate & MatchInfo)[], progress: number]>>;
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

  async search(query: string, chunk: number): Promise<Array<[candidates: (Candidate & MatchInfo)[], progress: number]>> {
    logger.debug("start searching: ", query);
    
    if (!query.trim()) {
      return [];
    }

    const filter = makeFilter<Candidate>(query);
    if (!filter) {
      // No filter needed, send empty result
      return [[[], 1.0]];
    }

    const source = [...candidates];
    const total = Math.ceil(source.length / chunk);
    const results: Array<[candidates: (Candidate & MatchInfo)[], progress: number]> = [];

    for (let i = 0; i < total; i++) {
      const progress = (i + 1) / total;
      const completed = i === total - 1;

      const searchCandidates = [...filter(
        source.values().drop(i * chunk).take(chunk),
      )];

      logger.debug(`[${i}/${total}] search result:`, searchCandidates);
      results.push([searchCandidates, progress]);

      // Yield control to prevent blocking the worker thread
      if (!completed) await delay(0);
    }

    return results;
  },
};

// Check if we're running as a SharedWorker or regular Worker
declare const SharedWorkerGlobalScope: any;

if (
  typeof SharedWorkerGlobalScope !== "undefined" &&
  self instanceof SharedWorkerGlobalScope
) {
  // SharedWorker mode
  (self as any).addEventListener("connect", (event: MessageEvent) => {
    const port = event.ports[0];
    Comlink.expose(searchWorkerAPI, port);
  });
} else {
  // Regular Worker mode
  Comlink.expose(searchWorkerAPI);
}

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
