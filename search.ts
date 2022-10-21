import { revertTitleLc, toTitleLc } from "./deps/scrapbox.ts";
import { Asearch } from "./deps/deno-asearch.ts";

export interface Candidate {
  title: string;
  titleLc: string;
  updated: number;
  metadata: {
    project: string;
    hasIcon: boolean;
  }[];
}
export interface CandidateWithPoint extends Candidate {
  point: number;
}

// deno-fmt-ignore
const getMaxDistance = [
  0, // 空文字のとき
  0, 0,
  1, 1,
  2, 2, 2, 2,
  3, 3, 3, 3, 3, 3,
  4, 4, 4, 4, 4, 4, 4, 4, 4, 4,
  5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5,
  6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6,
];

/** `query`に曖昧一致する候補を、編集距離つきで`chunk`個ずつ返す
 */
export function* filter(
  query: string,
  source: readonly Candidate[],
  chunk = 1000,
): Generator<CandidateWithPoint[], void, unknown> {
  if (query.trim() === "" || source.length === 0) return;

  // 空白を`_`に置換して、空白一致できるようにする
  // さらに64文字に切り詰める
  const queryLc = toTitleLc(
    [...query.replace(/\s+/g, " ")].slice(0, 64).join(""),
  );
  const forwardMatch = Asearch(`${queryLc} `).match;
  const match = Asearch(` ${queryLc} `).match;
  const maxDistance = getMaxDistance[queryLc.length];

  const queryIgnoreSpace = revertTitleLc(queryLc).trim();
  // 空白をワイルドカードとして検索する
  // 検索文字列が空白を含むときのみ実行
  const ignoreSpace = /\s/.test(query)
    ? {
      forwardMatch: Asearch(`${queryIgnoreSpace} `).match,
      match: Asearch(` ${queryIgnoreSpace} `).match,
      distance: getMaxDistance[queryIgnoreSpace.length],
    }
    : undefined;

  //let complete = false;
  //try {
  const total = Math.floor(source.length / chunk) + 1;
  for (let i = 0; i < total; i++) {
    //console.time(`[${i}/${total - 1}] search for "${query}"`);
    const result = source.slice(i * chunk, (i + 1) * chunk).flatMap((page) => {
      // 空白一致検索
      {
        const result = forwardMatch(page.titleLc, maxDistance);
        if (result.found) {
          return [{
            point: result.distance,
            ...page,
          }];
        }
      }
      {
        const result = match(page.titleLc, maxDistance);
        if (result.found) {
          return [{
            point: result.distance + 0.25,
            ...page,
          }];
        }
      }
      if (!ignoreSpace) return [];
      // 空白をワイルドカードとして検索
      {
        const result = ignoreSpace.forwardMatch(
          page.title,
          ignoreSpace.distance,
        );
        if (result.found) {
          return [{
            point: result.distance + 0.5,
            ...page,
          }];
        }
      }
      {
        const result = ignoreSpace.match(page.title, ignoreSpace.distance);
        if (result.found) {
          return [{
            point: result.distance + 0.75,
            ...page,
          }];
        }
      }
      return [];
    });
    //console.timeEnd(`[${i}/${total - 1}] search for "${query}"`);
    yield result;
  }
  //complete = true;
  //} finally {
  //  console.debug(`${complete ? "finish" : "cancel"} searching for "${query}"`);
  //}
}

/** 候補を並び替える */
export const sort = (
  candidates: readonly CandidateWithPoint[],
  projects: string[],
): CandidateWithPoint[] => {
  const projectMap = Object.fromEntries(
    projects.map((project, i) => [project, i]),
  );

  return [...candidates].sort((a, b) => {
    // 1. 優先順位順
    const diff = a.point - b.point;
    if (diff !== 0) return diff;
    // 2. 文字列が短い順
    const ldiff = a.title.length - b.title.length;
    if (ldiff !== 0) return ldiff;
    // 3. projectsで若い順
    const pdiff = Math.min(
      ...a.metadata.map((meta) => projectMap[meta.project] ?? projects.length),
    ) - Math.min(
      ...b.metadata.map((meta) => projectMap[meta.project] ?? projects.length),
    );
    if (pdiff !== 0) return pdiff;
    // 3. 更新日時が新しい順
    return b.updated - a.updated;
  });
};
