/// <reference no-default-lib="true" />
/// <reference lib="esnext" />
/// <reference lib="dom" />
/** @jsx h */
/** @jsxFrag Fragment */

import { Fragment, h, useCallback, useState } from "./deps/preact.tsx";
import { Completion, Operators as OperatorsBase } from "./Completion.tsx";
import { useSource } from "./useSource.ts";
import { UserCSS } from "./UserCSS.tsx";
import { SelectInit } from "./useSelect.ts";
import { CSS } from "./CSS.tsx";
import { useLifecycle } from "./useLifecycle.ts";
import { useSearch } from "./useSearch.ts";
import { useExports } from "./useExports.ts";

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
  callback: (operators: Operators | Record<keyof Operators, undefined>) => void;
  projects: Set<string>;
  mark: Record<string, string | URL>;
  style: string | URL;
  enableSelfProjectOnStart: boolean;
}

export const App = (props: AppProps) => {
  const source = useSource(props.projects);
  const [searchResult, { update, search }] = useSearch(source);
  const { state, setEnable, ...ops } = useLifecycle();

  update(source);
  search(
    state.type === "completion"
      ? state.context === "input" ? state.query.slice(1, -1) : state.query
      : "",
  );

  // API提供
  const [operators, setOperators] = useState<OperatorsBase | undefined>();
  const { callback, style, ...options } = props;
  useExports(callback, {
    enable: useCallback(() => setEnable(true), []),
    disable: useCallback(() => setEnable(false), []),
    ...((state.type !== "completion") || !operators ? opInit : operators),
  });

  return (
    <>
      <CSS />
      <UserCSS style={style} />
      {state.type === "completion" && searchResult &&
        (
          <Completion
            callback={setOperators}
            {...searchResult}
            {...state}
            {...ops}
            {...options}
          />
        )}
    </>
  );
};
