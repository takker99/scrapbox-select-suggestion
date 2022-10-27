import { useCallback, useState } from "./deps/preact.tsx";

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
  projects: string[],
): UseProjectFilterResult => {
  const [enableProjects, setEnableProjects] = useState(getEnables(projects));
  const set = useCallback((project: string, flag: boolean) => {
    setFrag(project, flag, projects);
    setEnableProjects(getEnables(projects));
  }, [projects]);

  return { projects: enableProjects, set };
};

/** 有効化されているprojectsのリストを取得する
 *
 * 値が設定されていなかったり、型が違っていた場合は、初期値を入れる
 */
const getEnables = (init: string[]): string[] => {
  try {
    const value = localStorage.getItem("enableProjectsOnSuggestion");
    if (value === null) {
      setEnables(init);
      return init;
    }

    const list = JSON.parse(value);
    if (
      Array.isArray(list) &&
      list.every((project) => typeof project === "string")
    ) {
      return list;
    }
    setEnables(init);
    return init;
  } catch (e: unknown) {
    if (!(e instanceof TypeError)) throw e;
    setEnables(init);
    return init;
  }
};

const setFrag = (project: string, flag: boolean, init: string[]): void => {
  const old = getEnables(init);
  setEnables(flag ? [...old, project] : old.filter((p) => p !== project));
};

const setEnables = (projects: string[]): void =>
  localStorage.setItem("enableProjectsOnSuggestion", JSON.stringify(projects));
