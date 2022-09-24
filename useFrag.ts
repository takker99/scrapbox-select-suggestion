import { StateUpdater, useEffect, useState } from "./deps/preact.tsx";
import { Range, Scrapbox } from "./deps/scrapbox.ts";
declare const scrapbox: Scrapbox;

type Frag = "enable" | "outrange" | "disable";
export const useFrag = (
  query: string,
  range: Range,
): readonly [Frag, StateUpdater<Frag>] => {
  const [frag, setFrag] = useState<Frag>("outrange");

  useEffect(
    () =>
      setFrag((prev) => {
        // 以下のときのみ表示する
        // - 文字列が空もしくは空白のみでない
        // - 一行だけ選択している
        // - 選択範囲がコードブロック、テーブル記法のタイトル、ページタイトルにいない
        if (scrapbox.Layout !== "page") return "outrange";

        // 選択範囲が消えたら、無効状態を解除する
        if (query.trim() === "") return "outrange";

        if (query.includes("\n")) return prev === "enable" ? "outrange" : prev;

        const cursorLine = scrapbox.Page.lines[range.start.line];
        if (
          "codeBlock" in cursorLine ||
          "title" in cursorLine ||
          ("tableBlock" in cursorLine && cursorLine.tableBlock.start)
        ) return prev === "enable" ? "outrange" : prev;
        return prev === "disable" ? prev : "enable";
      }),
    [query, range],
  );

  return [frag, setFrag] as const;
};
