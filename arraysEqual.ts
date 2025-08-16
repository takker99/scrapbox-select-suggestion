/**
 * 2つの文字列配列が同じ要素を持つかどうかを判定する（順序は無視）
 * @param a 最初の配列
 * @param b 2番目の配列
 * @returns 配列が同じ要素を持つ場合はtrue
 *
 * @example
 * ```ts
 * import { assert } from "./deps/testing.ts";
 *
 * // 同じ要素の配列はtrueを返す
 * assert(arraysEqual(["a", "b", "c"], ["c", "b", "a"]));
 * assert(arraysEqual([], []));
 * assert(arraysEqual(["test"], ["test"]));
 *
 * // 異なる要素の配列はfalseを返す
 * assert(!arraysEqual(["a", "b"], ["a", "c"]));
 * assert(!arraysEqual(["a", "b", "c"], ["a", "b"]));
 * assert(!arraysEqual([], ["a"]));
 *
 * // 重複要素を含む配列
 * assert(arraysEqual(["a", "a", "b"], ["a", "b", "a"]));
 * assert(!arraysEqual(["a", "a"], ["a", "b"]));
 * ```
 */
export const arraysEqual = (a: string[], b: string[]): boolean => {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((val, index) => val === sortedB[index]);
};
