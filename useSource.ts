import { useCallback, useEffect, useState } from "./deps/preact.tsx";
import { checkUpdate, listenUpdate, load, Source } from "./storage.ts";
import { Candidate } from "./search.ts";

/** 一つのリンクを表すデータ
 *
 * Indexed DBにあるデータから、不要なものを削っている
 *
 * データ量を減らすため、配列で表現する
 */
export interface Link extends Candidate {
  meta: [
    boolean, // 画像があるページかどうか
    number, // updated
  ];
}

/** 補完ソースを提供するhook */
export const useSource = (
  projects: string[],
): Map<string, Link[]> => {
  const [candidates, setCandidates] = useState(
    new Map<string, Link[]>(projects.map((project) => [project, []])),
  );

  const update = useCallback(
    (sources: Source[]) => {
      setCandidates((prev) => {
        // 更新されたソースのみ差し替える
        // なるべくprojectの挿入順は壊さないようにする
        for (const { project, links } of sources) {
          prev.set(
            project,
            links.map(([title, , hasIcon, , , updated]) =>
              ({ title, meta: [hasIcon, updated] }) as Link
            ),
          );
        }

        return new Map(prev);
      });
    },
    [],
  );

  // 初期化及び更新設定
  useEffect(() => {
    let terminate = false;

    const update_ = async (projects: string[]) => {
      const sources = await load(projects);
      if (terminate) return;

      update(sources);
    };

    update_(projects);

    let timer: number | undefined;
    const projectsUpdate = new Set<string>();
    // 更新通知を受け取る
    // 10秒待ってから更新する
    const cleanup = listenUpdate(projects, ({ project }) => {
      projectsUpdate.add(project);
      clearTimeout(timer);
      timer = setTimeout(() => {
        // 更新されたprojectのみ更新する
        update_([...projectsUpdate]);
        projectsUpdate.clear();
      }, 10000);
    });

    // 定期的に更新する
    const callback = async () => {
      const result = await checkUpdate(projects, 600);
      if (result.length === 0 || terminate) return;
      update(result);
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
