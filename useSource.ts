import { useCallback, useEffect, useState } from "./deps/preact.tsx";
import { check, decode, load, Source, subscribe } from "./deps/storage.ts";
import { createDebug } from "./debug.ts";
import { Candidate } from "./source.ts";
import { toTitleLc } from "./deps/scrapbox.ts";

const logger = createDebug("scrapbox-select-suggestion:useSource.ts");

/** 補完ソースを提供するhook */
export const useSource = (
  projects: Iterable<string>,
): Candidate[] => {
  const [candidates, setCandidates] = useState<Candidate[]>([]);

  const update = useCallback(
    (sources: Source[]) => {
      const start = new Date();

      const result = new Map<string, Omit<Candidate, "titleLc">>();
      for (const { project, links } of sources) {
        for (const compressedLink of links) {
          const { title, updated, image } = decode(compressedLink);
          const titleLc = toTitleLc(title);
          const candidate = result.get(titleLc);
          result.set(titleLc, {
            title: candidate?.title ?? title,
            updated: Math.max(candidate?.updated ?? 0, updated),
            metadata: [...(candidate?.metadata ?? []), { project, image }],
          });
        }
      }
      const candidates = [...result.entries()].map(([titleLc, data]) => ({
        titleLc,
        ...data,
      }));

      const ms = new Date().getTime() - start.getTime();
      logger.debug(`Compiled ${candidates.length} source in ${ms}ms`);

      setCandidates(candidates);
    },
    [],
  );

  // 初期化及び更新設定
  useEffect(() => {
    let terminate = false;

    const update_ = async () => {
      const sources = await load([...projects]);
      if (terminate) return;

      update(sources);
    };

    update_();

    let timer: number | undefined;
    const updatedProjects = new Set<string>();
    // 更新通知を受け取る
    // 10秒待ってから更新する
    const cleanup = subscribe([...projects], ({ projects }) => {
      for (const project of projects) {
        updatedProjects.add(project);
      }
      clearTimeout(timer);
      timer = setTimeout(() => {
        logger.debug(`Detect ${updatedProjects.size} projects' update`);
        update_();
        updatedProjects.clear();
      }, 10000);
    });

    // 定期的に更新する
    const callback = async () => {
      const result = await check([...projects], 600);
      if (result.length === 0 || terminate) return;
      logger.debug(`Detect ${result.length} projects' update`);
      update_();
    };
    callback();
    const intervalTimer = setInterval(callback, 600 * 1000);

    return () => {
      terminate = true;
      clearTimeout(timer);
      clearInterval(intervalTimer);
      cleanup();
    };
  }, [projects]);

  return candidates;
};
