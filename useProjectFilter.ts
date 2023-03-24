import { useCallback, useEffect, useState } from "./deps/preact.tsx";
import { Scrapbox } from "./deps/scrapbox.ts";
declare const scrapbox: Scrapbox;

const key = "enableProjectsOnSuggestion";

interface useProjectFilterOptions {
  /** scriptを実行しているprojectのソースを、設定に関わらず無条件で有効にするかどうか */
  enableSelfProjectOnStart: boolean;
}

interface UseProjectFilterResult {
  /** 検索対象のprojectsのリスト */
  projects: string[];

  /** 指定したprojectの有効無効を設定する */
  set: (project: string, flag: boolean) => void;
}

/** 検索対象のprojectsの設定を読み込むhooks
 *
 * @param projects 設定を取得したいprojectsのリスト
 * @return 検索対象のprojectsのリスト
 */
export const useProjectFilter = (
  projects: Iterable<string>,
  options: useProjectFilterOptions,
): UseProjectFilterResult => {
  const [enableProjects, setEnableProjects] = useState(
    getEnables([...projects], options),
  );
  const set = useCallback((project: string, flag: boolean) => {
    setFrag(project, flag, projects, options);
    setEnableProjects(getEnables([...projects], options));
  }, [projects, options.enableSelfProjectOnStart]);

  //更新通知を受け取る
  useEffect(() => {
    const listener = (e: StorageEvent) => {
      if (e.key !== key) return;
      setEnableProjects(getEnables([...projects], options));
    };
    addEventListener("storage", listener);
    return () => removeEventListener("storage", listener);
  }, [projects, options.enableSelfProjectOnStart]);

  return { projects: enableProjects, set };
};

let enableSelfProject = true;

/** 有効化されているprojectsのリストを取得する
 *
 * 値が設定されていなかったり、型が違っていた場合は、初期値を入れる
 */
const getEnables = (
  init: string[],
  options: useProjectFilterOptions,
): string[] => {
  try {
    const value = localStorage.getItem(key);
    if (value === null) {
      setEnables(init);
      return init;
    }

    const list = JSON.parse(value);
    if (
      Array.isArray(list) &&
      list.every((project) => typeof project === "string")
    ) {
      if (!options.enableSelfProjectOnStart) return list;
      if (!init.includes(scrapbox.Project.name)) return list;
      return list.includes(scrapbox.Project.name)
        ? enableSelfProject
          ? list
          : list.filter((p) => p !== scrapbox.Project.name)
        : enableSelfProject
        ? [...list, scrapbox.Project.name]
        : list;
    }
    setEnables(init);
    return init;
  } catch (e: unknown) {
    if (!(e instanceof TypeError)) throw e;
    setEnables(init);
    return init;
  }
};

const setFrag = (
  project: string,
  flag: boolean,
  init: Iterable<string>,
  options: useProjectFilterOptions,
): void => {
  const old = getEnables([...init], options);
  if (options.enableSelfProjectOnStart && project === scrapbox.Project.name) {
    enableSelfProject = flag;
  }
  setEnables(flag ? [...old, project] : old.filter((p) => p !== project));
};

const setEnables = (projects: string[]): void =>
  localStorage.setItem(key, JSON.stringify(projects));
