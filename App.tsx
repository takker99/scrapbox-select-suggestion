/// <reference no-default-lib="true" />
/// <reference lib="esnext" />
/// <reference lib="dom" />
/** @jsx h */
/** @jsxFrag Fragment */

import {
  Fragment,
  h,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "./deps/preact.tsx";
import { useSelection } from "./useSelection.ts";
import { usePosition } from "./usePosition.ts";
import { Completion, Operators as OperatorsBase } from "./Completion.tsx";
import { SelectInit } from "./useSelect.ts";
import { CSS } from "./CSS.tsx";
import {
  getCharDOM,
  Line,
  Scrapbox,
  takeCursor,
  textInput,
} from "./deps/scrapbox.ts";
import { reducer } from "./reducer.ts";
declare const scrapbox: Scrapbox;

/** 外部開放用API */
export interface Operators {
  /** 次候補を選択する
   *
   * @return 補完候補がなければ`false`
   */
  selectNext: (init?: SelectInit) => boolean;

  /** 前候補を選択する
   *
   * @return 補完候補がなければ`false`
   */
  selectPrev: (init?: SelectInit) => boolean;

  /** 最初の候補を選択する
   *
   * @return 補完候補がなければ`false`
   */
  selectFirst: () => boolean;

  /** 最後の候補を選択する
   *
   * @return 補完候補がなければ`false`
   */
  selectLast: () => boolean;

  /** 現在選択している候補で補完を実行する
   *
   * @return 補完を実行しなかったら`false`
   */
  confirm: () => boolean;

  /** 一時的に補完を中断する
   *
   * 一旦補完条件から抜けるまで補完を実行しない
   *
   * @return 補完が開始されていなければ`false`
   */
  cancel: () => boolean;

  /** このUserScriptを有効化する
   *
   * defaultで有効
   */
  enable: () => void;

  /** このUserScriptを無効化する */
  disable: () => void;
}

/** 外部開放用APIの初期値 */
export const opInit: OperatorsBase = {
  selectNext: () => false,
  selectPrev: () => false,
  selectFirst: () => false,
  selectLast: () => false,
  confirm: () => false,
  cancel: () => false,
} as const;

export interface AppProps {
  /** 表示する最大候補数 */
  limit: number;
  callback: (operators: Operators) => void;
  projects: string[];
  mark: Record<string, string | URL>;
  hideSelfMark: boolean;
  enableSelfProjectOnStart: boolean;
}

export const App = (props: AppProps) => {
  const {
    callback,
    projects,
    ...options
  } = props;
  const [state, dispatch] = useReducer(reducer, { state: "idle" });

  // ページの種類で有効無効判定をする
  const [disabled, setDisable] = useState(false);
  useEffect(() => {
    if (disabled) {
      dispatch({ type: "disable" });
      return;
    }

    const callback = () =>
      dispatch(
        {
          type: scrapbox.Layout === "page" ? "enable" : "disable",
        },
      );
    callback();
    scrapbox.addListener("layout:changed", callback);
    return () => scrapbox.removeListener("layout:changed", callback);
  }, [disabled]);

  // 補完開始判定
  const { text, range } = useSelection();
  // 選択範囲補完の判定
  useEffect(
    () => {
      if (
        state.state !== "idle" && state.state !== "completion" &&
        state.state !== "canceled"
      ) return;

      // Layoutが"page"でなければ無効にする
      // scrapbox.Page.linesを使えるようにするため、Layout用callbackとは別に判定している
      if (scrapbox.Layout !== "page") return;

      const cursorLine = scrapbox.Page.lines[range.start.line];
      if (
        !isSelectMode(cursorLine, text)
      ) {
        // 入力補完が起動しているときはスルー
        if (!(state.state === "completion" && state.context === "input")) {
          console.info("End completion due to no selection");
          dispatch({ type: "completionend" });
        }
        return;
      }

      // 補完が一時的に終了していたら何もしない
      if (state.state === "canceled") return;

      dispatch({
        type: "completionupdate",
        query: text.trim(),
        context: "selection",
        position: { line: range.start.line, char: range.start.char },
      });
    },
    // @ts-ignore contextはoptionalとして扱う
    [state.state, state.context, text, range],
  );
  // 入力補完の判定
  /** []の中かどうかを示すフラグ
   *
   * 中の場合でも、stateがcompletionでなかったり選択範囲補完が起動していたりする場合はfalseを返す */
  const [isInBracket, setIsInBracket] = useState(false);
  useEffect(
    () => {
      if (
        state.state !== "idle" && state.state !== "completion" &&
        state.state !== "canceled"
      ) {
        setIsInBracket(false);
        return;
      }

      // 選択範囲補完が起動しているときは何もしない
      if (state.state === "completion" && state.context === "selection") {
        setIsInBracket(false);
        return;
      }

      const cursor = takeCursor();
      const callback = () => {
        const { line, char } = cursor.getPosition();
        const pos = detectLink(line, char);
        if (!pos) {
          setIsInBracket(false);
          dispatch({ type: "completionend" });
          return;
        }
        setIsInBracket(state.state !== "canceled");
      };

      const caret = textInput()!;
      caret.addEventListener("change", callback);
      return () => caret.removeEventListener("change", callback);
    }, // @ts-ignore contextはoptionalとして扱う
    [state.state, state.context],
  );

  useEffect(
    () => {
      if (!isInBracket) return;

      const cursor = takeCursor();

      const callback = () => {
        const { line, char } = cursor.getPosition();
        const pos = detectLink(line, char);
        if (!pos) return;

        if (scrapbox.Layout !== "page") return;
        const cursorLine = scrapbox.Page.lines[line];
        dispatch({
          type: "completionupdate",
          query: cursorLine.text.slice(pos.start + 1, pos.end - 1),
          context: "input",
          range: pos,
          position: { line, char: pos.start },
        });
      };

      cursor.addChangeListener(callback);
      return () => cursor.removeChangeListener(callback);
    },
    [isInBracket],
  );

  // API提供
  const enable = useCallback(() => setDisable(false), []);
  const disable = useCallback(() => setDisable(true), []);
  // ...でopInitが破壊されないようにする
  const exportRef = useRef<Operators>({ ...opInit, enable, disable });
  const [operators, setOperators] = useState<OperatorsBase | undefined>();
  useEffect(() => {
    // currentの参照を壊さずに更新する
    Object.assign(
      exportRef.current,
      state.state !== "completion" || !operators ? opInit : operators,
    );
  }, [state.state, operators]);
  useEffect(
    () => callback(exportRef.current),
    [callback],
  );

  const { ref, ...position } = usePosition(
    state.state === "completion" ? state.position : { line: 0, char: 0 },
  );

  return (
    <>
      <CSS />
      <div className="compute" ref={ref} />
      {state.state === "completion" && (
        <Completion
          callback={setOperators}
          projects={projects}
          dispatch={dispatch}
          position={position}
          query={state.query}
          context={state}
          {...options}
        />
      )}
    </>
  );
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

const detectLink = (line: number, char: number) => {
  const charDOM = getCharDOM(line, char);
  // 行末にカーソルがあるときは、対応するDOMが存在しない
  if (!charDOM) return;
  if (!(charDOM instanceof HTMLSpanElement)) {
    throw TypeError(`span.c-${char} is not HTMLSpanElement`);
  }

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
  const chars = Array.from(
    link.getElementsByClassName("char-index"),
  ) as HTMLSpanElement[];
  if (chars.length === 0) throw Error("a.page-link must have a char at least.");

  const isCursorLine = link.closest(".cursor-line") != null;
  const start = parseInt(chars[0].dataset.charIndex ?? "0");
  const end = parseInt(chars[chars.length - 1].dataset.charIndex ?? "0");

  return isCursorLine ? { start, end } : { start: start - 1, end: end + 1 };
};
