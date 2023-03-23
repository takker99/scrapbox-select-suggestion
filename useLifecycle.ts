/// <reference no-default-lib="true" />
/// <reference lib="esnext" />
/// <reference lib="dom" />

import { useCallback, useEffect, useReducer, useRef } from "./deps/preact.tsx";
import { useSelection } from "./useSelection.ts";
import { insertText, Line, Scrapbox, takeStores } from "./deps/scrapbox.ts";
import { reducer, State } from "./reducer.ts";
declare const scrapbox: Scrapbox;

export interface UseLifecycleResult {
  /** 現在の状態 */
  state: State;

  /** 入力補完の有効/無効切り替え */
  setEnable: (value: boolean) => void;

  /** 現在の入力補完を中止する */
  cancel: () => void;

  /** 与えられた関数を実行し終えるまで状態遷移を無効にする */
  freezeUntil: {
    (job: () => void): void;
    (job: () => Promise<void>): Promise<void>;
  };

  /** 現在行を書き換えて、補完を終了する */
  confirmAfter: (
    updator: (prev: string) => string | Promise<string>,
  ) => Promise<void>;
}

/** 入力補完の状態管理を行うhooks */
export const useLifecycle = (): UseLifecycleResult => {
  const [state, dispatch] = useReducer(reducer, { type: "ready" });

  /** cacheしたページ本文。
   *
   * 他のeventがlines:changedと同じタイミングでdispatchが飛ばないよう、re-renderの対象からlinesを外しておく
   */
  const lines = useRef<Line[] | undefined>();
  // テキスト入力監視
  useEffect(() => {
    const callback = () => {
      lines.current = scrapbox.Layout === "page"
        ? scrapbox.Page.lines
        : undefined;
      const { cursor, selection } = takeStores();
      dispatch({
        type: "lines:changed",
        lines: lines.current,
        range: selection.getRange({ normalizeOrder: true }),
        position: cursor.getPosition(),
      });
    };
    scrapbox.addListener("lines:changed", callback);
    scrapbox.addListener("layout:changed", callback);
    return () => {
      scrapbox.removeListener("lines:changed", callback);
      scrapbox.removeListener("layout:changed", callback);
    };
  }, []);

  // 選択範囲変更監視
  const selection = useSelection();
  useEffect(() => {
    const { cursor, selection } = takeStores();
    dispatch({
      type: "selection:changed",
      lines: lines.current,
      range: selection.getRange({ normalizeOrder: true }),
      position: cursor.getPosition(),
    });
  }, [selection]);

  // カーソル操作監視
  // 入力補完が起動しているときのみ監視する
  useEffect(() => {
    if (state.context !== "input") return;
    const { cursor, selection } = takeStores();
    const callback = () => {
      dispatch({
        type: "cursor:changed",
        lines: lines.current,
        range: selection.getRange({ normalizeOrder: true }),
        position: cursor.getPosition(),
      });
    };
    cursor.addChangeListener(callback);
    return () => cursor.removeChangeListener(callback);
  }, [state.context]);

  const setEnable = useCallback(
    (flag: boolean) => dispatch({ type: flag ? "enable" : "disable" }),
    [],
  );
  const cancel = useCallback(() => (dispatch({ type: "cancel" })), []);
  const freezeUntil = useCallback(
    ((job) => {
      dispatch({ type: "lock" });
      const promise = job();
      if (promise instanceof Promise) {
        return promise.then(() => {
          dispatch({ type: "unlock" });
        });
      } else {
        dispatch({ type: "unlock" });
      }
    }) as UseLifecycleResult["freezeUntil"],
    [],
  );
  const confirmAfter: UseLifecycleResult["confirmAfter"] = useCallback(
    async (updator) => {
      // 補完が無効のときは何もしない
      if (!lines.current) return;
      dispatch({ type: "lock" });
      const { cursor, selection } = takeStores();
      const line = cursor.getPosition().line;
      const prev = lines.current[line].text;
      const text = await Promise.resolve(
        updator(prev),
      );

      // 上書き
      selection.setRange({
        start: { line, char: 0 },
        end: { line, char: [...prev].length },
      });
      await insertText(text);
      dispatch({ type: "unlock" });
    },
    [],
  );

  return { state, setEnable, cancel, freezeUntil, confirmAfter };
};
