import { useMemo, useSyncExternalStore } from "./deps/preact.tsx";
import { check, Diff, Link, load, subscribe } from "./deps/storage.ts";
import { createDebug } from "./deps/debug.ts";
import { Candidate } from "./source.ts";
import { toTitleLc } from "./deps/scrapbox.ts";

const logger = createDebug("scrapbox-select-suggestion:useSource.ts");

/** 補完ソースを提供するhook */
export const useSource = (
  projects: Iterable<string>,
): Candidate[] =>
  useSyncExternalStore(
    ...useMemo(() => {
      let candidates: Candidate[] = [];

      const listen = (flush: () => void) => {
        let store = load(projects).then((links) => {
          const map = makeCandidate(links);
          candidates = [...map.values()];
          flush();
          return map;
        });

        check(projects, 600);

        return subscribe(
          projects,
          ({ diff }) =>
            store = store.then((map) => {
              logger.debug(
                `Update: +${diff.added?.size ?? 0} pages, ~${
                  diff.updated?.size ?? 0
                } pages, -${diff.deleted?.size ?? 0} pages`,
              );
              map = applyDiff(map, diff);
              candidates = [...map.values()];
              flush();
              return map;
            }),
        );
      };
      const getSnapshot = () => candidates;

      return [listen, getSnapshot] as const;
    }, [projects]),
  );

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
