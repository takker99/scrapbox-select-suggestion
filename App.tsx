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
  useRef,
  useState,
} from "./deps/preact.tsx";
import { Completion, Operators as OperatorsBase } from "./Completion.tsx";
import { UserCSS } from "./UserCSS.tsx";
import { SelectInit } from "./useSelect.ts";
import { CSS } from "./CSS.tsx";
import { Scrapbox } from "./deps/scrapbox.ts";
import { useLifecycle } from "./useLifecycle.ts";
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
  enableSelfProjectOnStart: boolean;
}

export const App = (props: AppProps) => {
  const { state, setEnable, ...ops } = useLifecycle();

  // API提供

  const enable = useCallback(() => setEnable(true), []);
  const disable = useCallback(() => setEnable(false), []);

  // ...でopInitが破壊されないようにする
  const exportRef = useRef<Operators>({ ...opInit, enable, disable });
  const [operators, setOperators] = useState<OperatorsBase | undefined>();
  useEffect(() => {
    // currentの参照を壊さずに更新する
    Object.assign(
      exportRef.current,
      (state.type !== "completion") || !operators ? opInit : operators,
    );
  }, [state.type, operators]);

  const { callback, style, ...options } = props;
  useEffect(
    () => callback(exportRef.current),
    [callback],
  );

  return (
    <>
      <CSS />
      <UserCSS style={style} />
      {state.type === "completion" &&
        (
          <Completion
            callback={setOperators}
            {...state}
            {...ops}
            {...options}
          />
        )}
    </>
  );
};
