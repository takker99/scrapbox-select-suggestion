/// <reference no-default-lib="true" />
/// <reference lib="esnext" />
/// <reference lib="dom" />
import { h, Ref, useMemo, useRef } from "./deps/preact.tsx";
import { getCharDOM, Position } from "./deps/scrapbox.ts";

/** 補完リストの表示位置を計算するhook */
export const usePosition = (
  pos: Position,
): Pick<h.JSX.CSSProperties, "top" | "left" | "right"> & {
  ref: Ref<HTMLDivElement>;
} => {
  const ref = useRef<HTMLDivElement>(null); // 座標計算用

  const style = useMemo<Pick<h.JSX.CSSProperties, "top" | "left">>(() => {
    if (!ref.current) return {};

    // 座標を取得する
    const root = ref.current.parentNode;
    if (!(root instanceof ShadowRoot)) {
      throw Error(`The parent of "div.container" must be ShadowRoot`);
    }

    /** 基準座標 */
    const parentRect = root.host?.parentElement?.getBoundingClientRect?.();
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
  }, [pos.line, pos.char]);

  return { ref, ...style };
};
