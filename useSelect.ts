import { useCallback, useEffect, useState } from "./deps/preact.tsx";

/** useSelectの戻り値 */
export interface UseSelectResult {
  /** 選択している候補の要素番号
   *
   * 未選択のときは`-1`になる
   */
  selectedIndex: number;
  next: (init?: SelectInit) => void;
  prev: (init?: SelectInit) => void;
  selectFirst: () => void;
  selectLast: () => void;
}
export interface SelectInit {
  /** 先頭の前候補を末尾に、末尾の次候補を先頭にするかどうか
   *
   * - `true`: する
   * - `false`: しない (先頭または末尾の要素にとどまり続ける)
   *
   * @default false
   */
  cyclic?: boolean;
}

/** 選択状態を切り替えるhook */
export const useSelect = (itemCount: number): UseSelectResult => {
  const [index, setIndex] = useState(-1);
  // リストの長さが変わったら、選択をリセットする
  useEffect(() => setIndex(-1), [itemCount]);

  const next = useCallback((init?: SelectInit) =>
    setIndex(
      (old) =>
        init?.cyclic ? (old + 1) % itemCount : Math.min(old + 1, itemCount),
    ), [itemCount]);
  const prev = useCallback((init?: SelectInit) =>
    setIndex(
      (old) =>
        old < 0
          ? itemCount - 1
          : init?.cyclic
          ? (old + itemCount - 1) % itemCount
          : Math.max(old - 1, 0),
    ), [itemCount]);
  const selectFirst = useCallback(() => setIndex(0), []);
  const selectLast = useCallback(() => setIndex(itemCount - 1), [itemCount]);

  return {
    selectedIndex: index,
    next,
    prev,
    selectFirst,
    selectLast,
  } as const;
};
