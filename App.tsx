/** @jsxRuntime automatic */
/** @jsxImportSource npm:preact@10 */
import { useCallback, useState } from "./deps/preact.tsx";
import { Completion, type OperatorBase } from "./Completion.tsx";
import { useSource } from "./useSource.ts";
import { UserCSS } from "./UserCSS.tsx";
import { CSS } from "./CSS.tsx";
import { useLifecycle } from "./useLifecycle.ts";
import { useSearch } from "./useSearch.ts";
import { useExports } from "./useExports.ts";

/** 外部開放用API */
export interface Operators extends OperatorBase {
  /** このUserScriptを有効化する
   *
   * defaultで有効
   */
  enable: () => void;

  /** このUserScriptを無効化する */
  disable: () => void;
}

/** 外部開放用APIの初期値 */
export const opInit: OperatorBase = {
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
  workerUrl: string;
}

export const App = (props: AppProps) => {
  const source = useSource(props.projects);
  const [searchResult, { update, search }] = useSearch(source, {
    workerUrl: props.workerUrl,
  });
  const { state, setEnable, ...ops } = useLifecycle();

  update(source);
  search(
    state.type === "completion"
      ? state.context === "input" ? state.query.slice(1, -1) : state.query
      : "",
  );

  // API提供
  const [operators, setOperators] = useState<OperatorBase | undefined>();
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
