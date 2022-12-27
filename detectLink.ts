/// <reference no-default-lib="true" />
/// <reference lib="esnext" />
/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
import { getCharDOM } from "./deps/scrapbox.ts";

export interface Range {
  start: number;
  end: number;
}

/** 指定したカーソル位置を含むリンクを検出し、リンク位置を返す
 *
 * リンクがなければ`undefined`を返す
 *
 * @param line カーソルがいる行番号
 * @param char カーソルの右側にある文字の列番号
 * @return 検出したリンクの位置
 */
export const detectLink = (line: number, char: number): Range | undefined => {
  const charDOM = getCharDOM(line, char);
  // 行末にカーソルがあるときは、対応するDOMが存在しない
  if (!charDOM) return;

  // リンクのDOMを取得する
  // hashTagは未対応
  const link = charDOM.closest('a.page-link:not([type="hashTag"])');
  if (!link) return;
  if (!(link instanceof HTMLAnchorElement)) {
    throw TypeError(
      'a.page-link:not([type="hashTag"]) is not HTMLAnchorElement',
    );
  }

  // リンクの文字列の開始位置と終了位置を計算する
  // []も込み
  const chars = link.getElementsByClassName("char-index") as HTMLCollectionOf<
    HTMLSpanElement
  >;
  if (chars.length === 0) throw Error("a.page-link must have a char at least.");

  const start = parseInt(chars[0].dataset.charIndex ?? "0");
  const end = parseInt(chars[chars.length - 1].dataset.charIndex ?? "0");
  const isCursorLine = link.closest(".cursor-line") != null;

  const range = isCursorLine
    ? { start, end }
    : { start: start - 1, end: end + 1 };
  // カーソルがリンクの左隣にあるときは、範囲外なので除外する
  if (range.start === char) return;

  return range;
};
