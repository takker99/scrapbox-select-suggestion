import { revertTitleLc } from "./deps/scrapbox.ts";
import { bitDP } from "./bitDP.ts";

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
  /** 編集距離 */
  dist: number;
  /** queryがマッチした位置
   *
   * - 1番目：開始位置
   * - 2番目：終了位置
   */
  matches: [number, number][];
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

/** 一致する候補をしぼりこむ函数*/
export interface Filter {
  /** 一致する候補をしぼりこむ函数
   *
   * @param source 検索候補リスト
   * @return 一致した候補
   */
  (source: readonly Candidate[]): CandidateWithPoint[];
}

/** `query`に曖昧一致する候補を絞り込む函数を作る
 *
 * @param query 検索語句
 * @return 検索函数。検索不要なときは`undefined`を返す
 */
export const makeFilter = (query: string): Filter | undefined => {
  /** キーワードリスト
   *
   * - 空白は取り除く
   * - `_`は空白とみなす
   * - 長い順に並び替えておく
   *   - 長いqueryから検索したほうが、少なく絞り込める
   */
  const queries = revertTitleLc(query.trim()).split(/\s+/)
    .sort((a, b) => b.length - a.length);
  if (queries.length === 0 || queries.every((q) => q === "")) return;

  return (source) => {
    let result = [...source];
    const max = getMaxDistance[[...queries.join("")].length];
    for (const query of queries) {
      result = filter(query, max, result);
    }
    return result as CandidateWithPoint[];
  };
};

const filter = (
  query: string,
  maxDistance: number,
  source: (Candidate & { dist?: number; matches?: [number, number][] })[],
): CandidateWithPoint[] => {
  const m = [...query].length;
  const filter_ = bitDP(query);

  return source.flatMap(
    ({ title, dist, matches, ...props }) => {
      matches ??= [];
      dist ??= 0;

      const result = filter_(title)
        // 別のqueryでマッチした箇所は除く
        .flatMap((d, i) =>
          dist! + d <= maxDistance &&
            matches!.every(([s, e]) => i + m <= s || e < i)
            ? [[i, d]]
            : []
        );
      if (result.length === 0) return [];

      const newMatch = result.reduce((prev, [i, dist]) => {
        if (prev.dist <= dist) return prev;
        prev.dist = dist;
        prev.start = i;
        prev.end = i + m - 1;
        return prev;
      }, { dist: m, start: 0, end: m - 1 });

      const newDist = newMatch.dist + dist;
      if (newDist > maxDistance) return [];

      matches.push([newMatch.start, newMatch.end]);
      return [{ title, dist: newDist, matches, ...props }];
    },
  );
};

/** 候補を並び替える
 *
 * @param candidates 並び替えたい候補のリスト
 * @param projects projectの優先順位付けに使う配列。優先度の高い順にprojectを並べる
 * @return 並び替え結果
 */
export const sort = (
  candidates: readonly CandidateWithPoint[],
  projects: readonly string[],
): CandidateWithPoint[] => {
  const projectMap = Object.fromEntries(
    projects.map((project, i) => [project, i]),
  );

  return [...candidates].sort((a, b) => {
    // 1. 編集距離が短い順
    const diff = a.dist - b.dist;
    if (diff !== 0) return diff;

    // 2. マッチ位置が早い順
    const sa = a.matches.map(([s]) => s).sort();
    const sb = b.matches.map(([s]) => s).sort();
    for (let i = 0; i < sa.length; i++) {
      const sdiff = sa[i] - (sb[i] ?? sb.length);
      if (sdiff !== 0) return sdiff;
    }

    // 3. 文字列が短い順
    const ldiff = a.title.length - b.title.length;
    if (ldiff !== 0) return ldiff;

    // 4. projectsで若い順
    const pdiff = Math.min(
      ...a.metadata.map((meta) => projectMap[meta.project] ?? projects.length),
    ) - Math.min(
      ...b.metadata.map((meta) => projectMap[meta.project] ?? projects.length),
    );
    if (pdiff !== 0) return pdiff;

    // 5. 更新日時が新しい順
    return b.updated - a.updated;
  });
};
