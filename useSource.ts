import { useCallback, useEffect, useState } from "./deps/preact.tsx";
import { Candidate } from "./search.ts";
import {
  checkUpdate,
  listenUpdate,
  load,
  Options as useSourceOptions,
  Source,
} from "./storage.ts";

/** 補完ソースを提供するhook */
export const useSource = (
  projects: string[],
  options?: useSourceOptions,
): Candidate[] => {
  const [candidates, setCandidates] = useState<Candidate[]>([]);

  const update = useCallback(
    (sources: Source[]) => {
      const result = new Map<string, Omit<Candidate, "titleLc">>();
      for (const { project, links } of sources) {
        for (const [title, titleLc, hasIcon, , , updated] of links) {
          const candidate = result.get(titleLc);
          result.set(titleLc, {
            title: candidate?.title ?? title,
            updated: Math.max(candidate?.updated ?? 0, updated),
            metadata: [...(candidate?.metadata ?? []), { project, hasIcon }],
          });
        }
      }

      setCandidates(
        [...result.entries()].map(([titleLc, data]) => ({ titleLc, ...data })),
      );
    },
    [],
  );

  // 初期化及び更新設定
  useEffect(() => {
    let terminate = false;

    const update_ = async () => {
      const sources = await load(projects, options);
      if (terminate) return;

      update(sources);
    };

    update_();

    // 更新通知を受け取る
    let timer: number | undefined;
    // 10秒待ってから更新する
    const cleanup = listenUpdate(projects, () => {
      clearTimeout(timer);
      timer = setTimeout(update_, 10000);
    });

    // 定期的に更新する
    const callback = async () => {
      const result = await checkUpdate(projects, 600, options);
      if (result.length === 0 || terminate) return;
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
  }, [projects, options?.debug]);

  return candidates;
};
