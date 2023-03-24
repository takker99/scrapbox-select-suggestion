import { crawlLink, Link } from "./crawlLink.ts";
import { Line, Position, Range } from "./deps/scrapbox.ts";

// ?: undefinedは、propertyの有無にかかわらずアクセスできるようにするために指定してある
export type State =
  | {
    type: "ready";
    lock?: true;
    isManuallyDisabled?: undefined;
    context?: undefined;
    query?: undefined;
    start?: undefined;
    position?: undefined;
  }
  | {
    type: "disabled";
    lock?: true;
    isManuallyDisabled?: true;
    context?: undefined;
    query?: undefined;
    start?: undefined;
    position?: undefined;
  }
  | CompletionState
  | {
    type: "cancelled";
    lock?: true;
    context: "input" | "selection";
    isManuallyDisabled?: undefined;
    query?: undefined;
    start?: undefined;
    position?: undefined;
  };

export interface CompletionState {
  type: "completion";
  context: "input" | "selection";
  lock?: true;
  query: string;
  start: number;
  position: Position;
  isManuallyDisabled?: undefined;
}
export type Action = {
  type:
    | "enable"
    | "disable"
    | "lock"
    | "unlock"
    | "cancel";
  lines?: undefined;
} | {
  type: "lines:changed" | "cursor:changed" | "selection:changed";
  /** Layout !== "page" のときはundefinedになる */
  lines?: Line[];
  position: Position;
  range: Range;
};

export const reducer = (state: State, action: Action): State => {
  if (action.type === "unlock") {
    if (!state.lock) return state;
    const { lock: _, ...props } = state;
    return { ...props };
  }
  if (state.lock) return state;

  switch (action.type) {
    case "lock": {
      const { lock: _, ...props } = state;
      return { lock: true, ...props };
    }
    case "enable":
      return state.type === "disabled" && state.isManuallyDisabled
        ? { type: "ready" }
        : state;
    case "disable":
      return state.type === "disabled" && state.isManuallyDisabled
        ? state
        : { type: "disabled", isManuallyDisabled: true };
  }
  if (state.type === "disabled") {
    if (state.isManuallyDisabled || !action.lines) return state;
    // Layoutが"page"に戻ったらreadyに復帰する
    return { type: "ready" };
  }

  // 補完を中断する
  if (action.type === "cancel") {
    return state.type === "completion"
      ? { type: "cancelled", context: state.context }
      : state;
  }

  // Layout !== "page"のときは無効
  if (!action.lines) return { type: "disabled" };

  // layoutがpageのときの処理

  const start = Math.min(action.range.start.char, action.range.end.char);
  const end = Math.max(action.range.start.char, action.range.end.char);

  /** 選択しているテキスト
   *
   * 複数行選択は真面目に計算しない。複数行かどうかだけ判定できるよう、改行文字を入れておく
   */
  const selectedText = !action.lines
    ? ""
    : action.range.start.line !== action.range.end.line
    ? "\n"
    : [...action.lines[action.range.start.line].text].slice(start, end)
      .join("");

  // 単一行の選択範囲があれば、選択範囲補完を優先して起動する
  if (
    isSelectMode(action.lines[action.position.line], selectedText)
  ) {
    if (state.type !== "cancelled") {
      return {
        type: "completion",
        context: "selection",
        query: selectedText,
        start,
        position: action.position,
      };
    }
  }

  // 選択範囲補完できない状態で文字選択されているときは、なにも起動しない
  if (selectedText !== "") {
    return state.type === "completion" ? { type: "ready" } : state;
  }

  // 以降、文字選択されていない状態

  const link = detectLink(
    action.lines[action.position.line],
    action.position.char,
  );
  if (!link) return state.type === "ready" ? state : { type: "ready" };
  if (state.type === "cancelled" && state.context === "input") return state;
  if (state.type === "completion" || action.type === "lines:changed") {
    return {
      type: "completion",
      context: "input",
      query: link.whole,
      start: link.start,
      position: action.position,
    };
  }
  return state.type === "ready" ? state : { type: "ready" };
};

/** charを含むリンクを探す */
const detectLink = (
  line: Line,
  char: number,
): Link | undefined => {
  for (const { whole, start } of crawlLink(line)) {
    if (char <= start || start + [...whole].length <= char) {
      continue;
    }
    return { whole, start };
  }
};

/** 選択範囲入力補完を実行できるかどうか返す函数
 *
 * 補完しない条件
 * - 選択範囲が空
 * - 複数行を選択している
 * - コードブロック、タイトル行、テーブルのタイトルにいる
 */
const isSelectMode = (cursorLine: Line, selectedText: string) =>
  !(selectedText.trim() === "" || selectedText.includes("\n") ||
    "codeBlock" in cursorLine ||
    "title" in cursorLine ||
    ("tableBlock" in cursorLine && cursorLine.tableBlock.start));
