import { type h, useMemo, useState } from "./deps/preact.tsx";
import { getCharDOM, type Position } from "./deps/scrapbox.ts";

/** 補完リストの表示位置を計算するhook */
export const usePosition = (
  pos: Position,
): Pick<h.JSX.CSSProperties, "top" | "left" | "right"> & {
  updateStandardElement: (element: Element | null) => void;
} => {
  const [standardElement, updateStandardElement] = useState<Element | null>(
    null,
  );

  const style = useMemo<Pick<h.JSX.CSSProperties, "top" | "left">>(() => {
    /** 基準座標 */
    const parentRect = standardElement?.getBoundingClientRect?.();
    /** 合わせたいDOMの座標 */
    const char = getCharDOM(pos.line, pos.char);
    const rect = char?.getBoundingClientRect?.();
    if (!rect || !parentRect) return {};

    return {
      top: `${rect.bottom - parentRect.top}px`,
      left: `${(rect?.left ?? 0 - parentRect.left)}px`,
      // 右端から位置合わせしたいときに使う
      right: `${(parentRect.right - (rect?.left ?? 0))}px`,
    };
  }, [standardElement, pos.line, pos.char]);

  return { updateStandardElement, ...style };
};
