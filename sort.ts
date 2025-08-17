import type { MatchInfo } from "./search.ts";
import type { Candidate } from "./source.ts";

/** 候補を昇順に比較する函数を作る
 *
 * 返り値の意味はArray.prototype.sort()にわたす函数と同じ
 *
 * @param projects projectの優先順位付けに使う配列。優先度の高い順にprojectを並べる
 * @return 昇順に比較する函数
 */
export const compareAse = (
  a: Candidate & MatchInfo,
  b: Candidate & MatchInfo,
): number => {
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

  // 4. 更新日時が新しい順
  return b.updated - a.updated;
};
