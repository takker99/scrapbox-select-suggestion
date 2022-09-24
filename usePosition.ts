/// <reference no-default-lib="true" />
/// <reference lib="esnext" />
/// <reference lib="dom" />
import { Range, selections } from "./deps/scrapbox.ts";
import { h, Ref, useMemo, useRef } from "./deps/preact.tsx";

/** 補完リストの表示位置を計算するhook */
export const usePosition = (
  range: Range,
): Pick<h.JSX.CSSProperties, "top" | "left"> & { ref: Ref<HTMLDivElement> } => {
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
    /** 選択範囲の座標 */
    const rect = Array.from(
      selections()?.getElementsByClassName?.("selection") ?? [],
    )
      .pop()?.getBoundingClientRect?.();
    if (!rect || !parentRect) return {};

    return {
      top: `${rect.bottom - parentRect.top}px`,
      left: `${(rect.left - parentRect.left)}px`,
    };
  }, [, range]);

  return { ref, ...style };
};
