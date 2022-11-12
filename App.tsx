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
import { usePosition } from "./usePosition.ts";
import { Completion, Operators as OperatorsBase } from "./Completion.tsx";
import { SelectInit } from "./useSelect.ts";
import { CSS } from "./CSS.tsx";
import { Scrapbox } from "./deps/scrapbox.ts";
import { reducer } from "./reducer.ts";
import { takeStores } from "./deps/scrapbox.ts";
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
    scrapbox.addListener("layout:changed", callback);
    return () => scrapbox.removeListener("layout:changed", callback);
  }, [disabled]);

  // 補完開始判定
  const { text, range } = useSelection();
  useEffect(
    () => {
      if (
        state.state !== "idle" && state.state !== "completion" &&
        state.state !== "canceled"
      ) return;

      // Layoutが"page"でなければ無効にする
      // scrapbox.Page.linesを使えるようにするため、Layout用callbackとは別に判定している
      if (scrapbox.Layout !== "page") {
        dispatch({ type: "disable" });
        return;
      }

      // 以下の条件で補完を終了する
      // - 選択範囲が空
      // - 複数行を選択している
      // - コードブロック、タイトル行、テーブルのタイトルにいる
      const cursorLine = scrapbox.Page.lines[range.start.line];
      if (
        text.trim() === "" || text.includes("\n") ||
        "codeBlock" in cursorLine ||
        "title" in cursorLine ||
        ("tableBlock" in cursorLine && cursorLine.tableBlock.start)
      ) {
        dispatch({ type: "completionend" });
        return;
      }

      // 補完が一時的に終了していたら何もしない
      if (state.state === "canceled") return;

      const { cursor } = takeStores();
      dispatch({
        type: "completionupdate",
        query: text.trim(),
        context: "selection",
        range,
        cursor,
      });
    },
    [state.state, text, range],
  );

  // API提供
  const enable = useCallback(() => setDisable(false), []);
  const disable = useCallback(() => setDisable(true), []);
  // ...でopInitが破壊されないようにする
  const exportRef = useRef<Operators>({ ...opInit, enable, disable });
  const callback_ = useCallback((operators?: OperatorsBase) => {
    // currentの参照を壊さずに更新する
    Object.assign(
      exportRef.current,
      state.state !== "completion" || !operators ? opInit : operators,
    );
  }, [state.state]);
  useEffect(
    () => callback(exportRef.current),
    [callback],
  );

  // 座標計算
  const { ref, ...position } = usePosition(range);

  return (
    <>
      <CSS />
      <div className="compute" ref={ref} />
      {state.state === "completion" && (
        <Completion
          callback={callback_}
          projects={projects}
          dispatch={dispatch}
          position={position}
          {...state}
          {...options}
        />
      )}
    </>
  );
};
