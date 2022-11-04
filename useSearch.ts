import { useEffect, useReducer, useState } from "./deps/preact.tsx";
import { Candidate, CandidateWithPoint, sort } from "./search.ts";
import { incrementalSearch } from "./incrementalSearch.ts";

export interface Link {
  title: string;
  projects: string[];
}

export type SearchAction = {
  type: "query:changed";
  query: string;
} | {
  type: "source:changed";
  source: Candidate[];
} | {
  type: "projects:changed";
  projects: string[];
} | {
  type: "enable:changed";
  enable: boolean;
};

/** 検索するhooks
 *
 * 引数は全てdispatchから指定する
 */
export const useSearch = (): readonly [
  Link[],
  (action: SearchAction) => void,
] => {
  // queryが変更されたかどうかで処理を分けたいので、useReducerを使った
  const [resource, dispatch] = useReducer(reducer, {
    query: "",
    source: [],
    projects: [],
    queryChanged: true,
    enable: false,
  });
  const [links, setLinks] = useState<Link[]>([]);

  useEffect(() => {
    if (!resource.enable) {
      setLinks([]);
      return;
    }
    const filter = incrementalSearch(resource.query);
    if (!filter) {
      setLinks([]);
      return;
    }

    let terminate = false;
    let timer: number | undefined;
    const update = (candidates: CandidateWithPoint[]) =>
      setLinks(convert(candidates, resource.projects));

    (async () => {
      if (resource.queryChanged) {
        // 検索結果を順次送り出す
        for await (const candidates of filter(resource.source)) {
          clearTimeout(timer);
          if (terminate) return;

          if (!timer) update(candidates);
          timer = setTimeout(() => update(candidates), 500);
        }
      } else {
        // ソースだけ更新されたときは、全部検索し終えてから差し替える
        let results: CandidateWithPoint[] = [];
        for await (const cands of filter(resource.source)) {
          if (terminate) return;
          results = cands;
        }
        update(results);
      }
    })();

    return () => {
      terminate = true;
    };
  }, [resource]);

  return [links, dispatch] as const;
};

/** 検索結果をprojectsの順に並び替え、必要な情報だけ取り出す */
const convert = (
  candidates: CandidateWithPoint[],
  projects: string[],
): Link[] =>
  sort(candidates, projects)
    .map((page) => ({
      title: page.title,
      projects: page.metadata.map(({ project }) => project),
    }));

interface SearchInit {
  source: Candidate[];
  query: string;
  projects: string[];
  queryChanged: boolean;
  enable: boolean;
}
const reducer = (state: SearchInit, action: SearchAction): SearchInit => {
  switch (action.type) {
    case "query:changed":
      return {
        query: action.query,
        source: state.source,
        projects: state.projects,
        queryChanged: true,
        enable: state.enable,
      };
    case "source:changed":
      return {
        query: state.query,
        source: action.source,
        projects: state.projects,
        queryChanged: false,
        enable: state.enable,
      };
    case "projects:changed":
      return {
        query: state.query,
        source: state.source,
        projects: action.projects,
        queryChanged: false,
        enable: state.enable,
      };
    case "enable:changed":
      return {
        query: state.query,
        source: state.source,
        projects: state.projects,
        queryChanged: false,
        enable: action.enable,
      };
  }
};
