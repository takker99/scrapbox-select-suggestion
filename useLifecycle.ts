import { createDebug } from "./deps/debug.ts";
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from "./deps/preact.tsx";
import {
  addCursorChangeListener,
  addSelectionChangeListener,
  goChar,
  goLine,
  type Position,
  type Range,
  removeCursorChangeListener,
  removeSelectionChangeListener,
  type Scrapbox,
  textInput,
} from "./deps/scrapbox.ts";
import { reducer, type State } from "./reducer.ts";
import { useCachedLines } from "./useCachedLines.ts";
declare const scrapbox: Scrapbox;

const logger = createDebug("scrapbox-select-suggestion:useLifecycle.ts");

const getNormalizedSelectionRange = (): Range => {
  const selection = scrapbox.Page.selection;
  if (!selection) {
    return {
      start: { line: 0, char: 0 },
      end: { line: 0, char: 0 },
    };
  }
  const { start, end } = selection;
  return start.line > end.line ||
      (start.line === end.line && start.char > end.char)
    ? { start: end, end: start }
    : { start, end };
};

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
    updator: (prev: string, position: Position) => [string, Position],
  ) => Promise<void>;
}

/** 入力補完の状態管理を行うhooks */
export const useLifecycle = (): UseLifecycleResult => {
  const [state, dispatch] = useReducer(reducer, { type: "ready" });

  const getLines = useCachedLines();
  /** dispatchをdebounceしたもの
   *
   * cursor:changedのみ100ms待機させる
   */
  const debouncedDispatch = useMemo(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    return (type: "lines:changed" | "selection:changed" | "cursor:changed") => {
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(
        () => {
          dispatch({
            type,
            lines: getLines(),
            range: getNormalizedSelectionRange(),
            position: scrapbox.Page.cursor ?? { line: 0, char: 0 },
          });
        },
        type === "cursor:changed" ? 100 : undefined,
      );
    };
  }, []);

  useEffect(() => {
    const handleLineChanged = () => {
      debouncedDispatch("lines:changed");
    };
    // テキスト入力監視
    scrapbox.addListener("lines:changed", handleLineChanged);
    scrapbox.addListener("layout:changed", handleLineChanged);
    const handleSelectionChanged = () => {
      debouncedDispatch("selection:changed");
    };
    // 選択範囲変更監視
    addSelectionChangeListener(handleSelectionChanged);
    return () => {
      scrapbox.removeListener("lines:changed", handleLineChanged);
      scrapbox.removeListener("layout:changed", handleLineChanged);
      removeSelectionChangeListener(handleSelectionChanged);
    };
  }, []);

  // カーソル操作監視
  // 入力補完が起動しているときのみ監視する
  useEffect(() => {
    if (state.context !== "input") return;
    const callback = () => {
      debouncedDispatch("cursor:changed");
    };
    addCursorChangeListener(callback);
    return () => removeCursorChangeListener(callback);
  }, [state.context]);

  const [prevState, setPrevState] = useState<State>(state);
  if (prevState !== state) {
    setPrevState(state);
    logger.debug("Detect changes", state);
  }

  return {
    state,
    setEnable: useCallback(
      (flag: boolean) => dispatch({ type: flag ? "enable" : "disable" }),
      [],
    ),
    cancel: useCallback(() => dispatch({ type: "cancel" }), []),
    freezeUntil: useCallback(
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
    ),
    confirmAfter: useCallback(
      async (updator) => {
        const lines = getLines();
        // 補完が無効のときは何もしない
        if (!lines) return;
        dispatch({ type: "lock" });
        const cursorPosition = scrapbox.Page.cursor ?? { line: 0, char: 0 };
        const line = cursorPosition.line;
        const prev = lines[line].text;
        const [text, position] = updator(prev, cursorPosition);

        // 上書き
        scrapbox.Page.updateLine(text, line);
        await scrapbox.Page.waitForSave();
        if (position.char >= [...text].length) {
          await goLine(position.line);
        } else {
          await goChar(position.line, position.char);
        }
        textInput()?.focus();
        dispatch({ type: "unlock" });
        dispatch({ type: "cancel" });
      },
      [],
    ),
  };
};
