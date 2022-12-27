import { revertTitleLc } from "./deps/scrapbox.ts";
import { bitDP } from "./bitDP.ts";

export interface Candidate {
  title: string;
}
export interface MatchInfo {
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
export interface Filter<T extends Candidate> {
  /** 一致する候補をしぼりこむ函数
   *
   * @param source 検索候補リスト
   * @return 一致した候補
   */
  (source: readonly T[]): (T & MatchInfo)[];
}

/** `query`に曖昧一致する候補を絞り込む函数を作る
 *
 * @param query 検索語句
 * @return 検索函数。検索不要なときは`undefined`を返す
 */
export const makeFilter = <T extends Candidate>(
  query: string,
): Filter<T> | undefined => {
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
    for (const query of queries) {
      result = filter(query, result);
    }
    return result as (T & MatchInfo)[];
  };
};

const filter = <T extends Candidate>(
  query: string,
  source: (T & Partial<MatchInfo>)[],
): (T & MatchInfo)[] => {
  const m = [...query].length;
  const maxDistance = getMaxDistance[m];
  const filter_ = bitDP(query);

  return source.flatMap(
    ({ title, dist, matches, ...props }) => {
      matches ??= [];
      dist ??= 0;

      const result = filter_(title)
        .flatMap((d, i) =>
          d <= maxDistance &&
            // 別のqueryでマッチした箇所は除く
            matches!.every(([s, e]) => i + m <= s || e < i)
            ? [[i, d]]
            : []
        );
      if (result.length === 0) return [];

      const newMatch = result.reduce((prev, [i, dist]) => {
        if (prev.dist <= dist) return prev;
        prev.dist = dist;
        prev.start = i;
        return prev;
      }, { dist: m, start: 0 });

      matches.push([newMatch.start, newMatch.start + m - 1]);
      return [
        {
          title,
          dist: newMatch.dist + dist,
          matches,
          ...props,
        } as (T & MatchInfo),
      ];
    },
  );
};
