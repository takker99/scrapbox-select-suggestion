import { useCallback, useEffect, useRef } from "./deps/preact.tsx";
import type { Line, Scrapbox } from "./deps/scrapbox.ts";
declare const scrapbox: Scrapbox;

/** scrapbox.Page.linesを遅延取得するhooks
 *
 * scrapbox.Page.linesの生成には時間がかかるので、実際に必要になるまで呼び出さないようにする
 */
export const useCachedLines = (): () => Line[] | undefined => {
  const lines = useRef(scrapbox.Page.lines);
  const isUpdatedYet = useRef(false);

  useEffect(() => {
    const callback = () => {
      isUpdatedYet.current = true;
    };
    scrapbox.addListener("lines:changed", callback);
    scrapbox.addListener("layout:changed", callback);
    return () => {
      scrapbox.removeListener("lines:changed", callback);
      scrapbox.removeListener("layout:changed", callback);
    };
  }, []);

  return useCallback(() => {
    // 更新があれば、新しいlinesに取り替える
    if (isUpdatedYet.current) {
      lines.current = scrapbox.Page.lines;
      isUpdatedYet.current = false;
    }
    return lines.current ?? undefined;
  }, []);
};
