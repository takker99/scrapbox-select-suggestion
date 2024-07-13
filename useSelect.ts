import { useCallback, useState } from "./deps/preact.tsx";

/** useSelectの戻り値 */
export interface UseSelectResult {
  selectedId: string | null;
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
export const useSelect = <T>(
  items: T[],
  selector: (item: T) => string,
): UseSelectResult => {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const next = useCallback((init?: SelectInit) =>
    setSelectedId(
      (prev) => {
        if (items.length === 0) return null;
        if (prev === null) return selector(items[0]);
        const index = items.findIndex((item) => selector(item) === prev);
        return selector(
          init?.cyclic
            ? items[(index + 1) % items.length]
            : items.at(index + 1) ?? items[0],
        );
      },
    ), [items, selector]);
  const prev = useCallback((init?: SelectInit) =>
    setSelectedId(
      (prev) => {
        if (items.length === 0) return null;
        if (prev === null) return selector(items[items.length - 1]);
        const index = items.findIndex((item) => selector(item) === prev);
        if (index < 0) return selector(items[items.length - 1]);
        return selector(
          init?.cyclic
            ? items[(index - 1 + items.length) % items.length]
            : items.at(index - 1) ?? items[items.length - 1],
        );
      },
    ), [items, selector]);
  const selectFirst = useCallback(
    () => setSelectedId(items.length === 0 ? null : selector(items[0])),
    [items, selector],
  );
  const selectLast = useCallback(
    () =>
      setSelectedId(
        items.length === 0 ? null : selector(items[items.length - 1]),
      ),
    [
      items,
      selector,
    ],
  );

  return {
    selectedId,
    next,
    prev,
    selectFirst,
    selectLast,
  } as const;
};
