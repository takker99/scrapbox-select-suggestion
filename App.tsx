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
  useReducer,
  useRef,
  useState,
} from "./deps/preact.tsx";
import { useSelection } from "./useSelection.ts";
import { Completion, Operators as OperatorsBase } from "./Completion.tsx";
import { UserCSS } from "./UserCSS.tsx";
import { SelectInit } from "./useSelect.ts";
import { CSS } from "./CSS.tsx";
import { detectLink } from "./detectLink.ts";
import { Line, Scrapbox, takeCursor, textInput } from "./deps/scrapbox.ts";
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
  style: string | URL;
  hideSelfMark: boolean;
  enableSelfProjectOnStart: boolean;
}

export const App = (props: AppProps) => {
  const {
    callback,
    projects,
    style,
    ...options
  } = props;
  const [state, dispatch] = useReducer(reducer, { state: "idle", query: "" });

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

      // 左端の文字の位置を得る
      const line = Math.min(range.start.line, range.end.line);
      const char = range.start.line < range.end.line
        ? range.start.char
        : range.start.line === range.start.line
        ? Math.min(range.start.char, range.end.char)
        : range.end.char;

      dispatch({
        type: "completionupdate",
        query: text.trim(),
        context: "selection",
        position: { line, char },
      });
    },
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

        // []内で文字入力したら、即座に補完を開始する
        if (scrapbox.Layout !== "page" || state.state === "canceled") return;
        const cursorLine = scrapbox.Page.lines[line];
        dispatch({
          type: "completionupdate",
          query: cursorLine.text.slice(pos.start + 1, pos.end - 1),
          context: "input",
          range: pos,
          position: { line, char: pos.start },
        });
      };

      scrapbox.addListener("lines:changed", callback);
      return () => scrapbox.removeListener("lines:changed", callback);
    },
    [state.state, state.context],
  );

  // カーソルが外に出たかどうかだけを監視する
  // 外に出たらcompletionendを発行する
  useEffect(
    () => {
      if (!isInBracket) return;

      const cursor = takeCursor();

      const callback = () => {
        const { line, char } = cursor.getPosition();
        const pos = detectLink(line, char);
        if (pos) return;

        dispatch({ type: "completionend" });
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

  return (
    <>
      <CSS />
      <UserCSS style={style} />
      <Completion
        callback={setOperators}
        projects={projects}
        dispatch={dispatch}
        {...state}
        {...options}
      />
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
