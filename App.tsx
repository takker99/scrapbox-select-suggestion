/// <reference no-default-lib="true" />
/// <reference lib="esnext" />
/// <reference lib="dom" />
/** @jsx h */
/** @jsxFrag Fragment */

import {
  Fragment,
  h,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "./deps/preact.tsx";
import { useSelection } from "./useSelection.ts";
import { useFrag } from "./useFrag.ts";
import { useSource } from "./useSource.ts";
import { usePosition } from "./usePosition.ts";
import { Candidate as CandidateComponent } from "./Candidate.tsx";
import { SelectInit, useSelect } from "./useSelect.ts";
import { detectURL } from "./util.ts";
import { incrementalSearch } from "./incrementalSearch.ts";
import { insertText } from "./deps/scrapbox.ts";

export interface Operators {
  selectNext: (init?: SelectInit) => boolean;
  selectPrev: (init?: SelectInit) => boolean;
  selectFirst: () => boolean;
  selectLast: () => boolean;
  confirm: () => boolean;
  cancel: () => boolean;
}

/** 外部開放用APIの初期値 */
const opInit: Operators = {
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
  debug?: boolean;
}

export const App = (props: AppProps) => {
  const { limit, callback, projects, debug, mark } = props;

  const { text, range } = useSelection();
  const [frag, setFrag] = useFrag(text, range);
  const source = useSource(projects, { debug });

  // 検索
  const [candidates, setCandidates] = useState<{
    title: string;
    projects: {
      name: string;
      mark: string | URL;
      confirm: () => void;
    }[];
    confirm: () => void;
  }[]>([]);
  useEffect(() => {
    if (frag !== "enable") return;
    if (text.trim() === "") return;

    return incrementalSearch(text, source, (candidates) =>
      setCandidates(
        candidates
          .map((page) => ({
            title: page.title,
            projects: page.metadata.map(({ project }) => ({
              name: project,
              mark: detectURL(mark[project] ?? "") || project[0],
              confirm: () => insertText(`[/${project}/${page.title}]`),
            })),
            confirm: () => insertText(`[${page.title}]`),
          })),
      ));
  }, [text, source, frag]);

  // 候補選択
  const visibleCandidateCount = Math.min(candidates.length, limit);
  const { selectedIndex, next, prev, selectFirst, selectLast } = useSelect(
    visibleCandidateCount,
  );

  // スタイル設定
  const { ref, top, left } = usePosition(range);
  /** windowの開閉およびwindows操作の有効状態を決めるフラグ */
  const isOpen = useMemo(
    () => {
      return frag === "enable" && candidates.length > 0 && top !== undefined &&
        left !== undefined;
    },
    [frag, candidates.length, top, left],
  );
  const divStyle = useMemo<h.JSX.CSSProperties>(
    () => !isOpen ? { display: "none" } : { top, left },
    [isOpen, top, left],
  );

  // API提供
  // ...でopInitが破壊されないようにする
  const exportRef = useRef<Operators>({ ...opInit });
  useEffect(() => {
    // currentの参照を壊さずに更新する
    Object.assign(
      exportRef.current,
      !isOpen ? opInit : {
        selectNext: (init?: SelectInit) => (next(init), true),
        selectPrev: (init?: SelectInit) => (prev(init), true),
        selectFirst: () => (selectFirst(), true),
        selectLast: () => (selectLast(), true),
        confirm: () => {
          const a = ref.current?.getElementsByClassName?.("candidate selected")
            ?.[0];
          return a instanceof HTMLAnchorElement ? (a.click(), true) : false;
        },
        cancel: () => (setFrag("disable"), true),
      },
    );
  }, [isOpen, next, prev, selectFirst, selectLast]);
  useEffect(
    () => callback(exportRef.current),
    [callback],
  );

  return (
    <>
      <style>
        {`.container {
  position: absolute;
  max-width: 80vw;
  max-height: 80vh;
  margin-top: 14px;
  z-index: 301;
  
  background-color: var(--select-suggest-bg, #111);
  font-family: var(--select-suggest-font-family, "Open Sans", Helvetica, Arial, "Hiragino Sans", sans-serif);
  color: var(--select-suggest-text-color, #eee);
  border-radius: 4px;
}
.container > :not(:first-child) {
  border-top: 1px solid var(--select-suggest-border-color, #eee);
}
.container > *{
  font-size: 11px;
  line-height: 1.2em;
  padding: 0.5em 10px;
}
.candidate {
  display: flex;
}
a {
  display: block;
  text-decoration: none;
  color: inherit;
  width: 100%;
}
.selected a {
  background-color: var(--select-suggest-selected-bg, #222);
  text-decoration: underline
}
.candidate img {
  height: 1.3em;
  width: 1.3em;
  position: relative;
  top: -0.3em;
  object-fit: cover;
  object-position: 0% 0%;

}
.counter {
  color: var(--select-suggest-information-text-color, #aaa);
  font-size: 80%;
  font-style: italic;
}`}
      </style>
      <div className="container" ref={ref} style={divStyle}>
        {candidates.slice(0, visibleCandidateCount).map((props, i) => (
          <CandidateComponent
            key={props.title}
            {...props}
            selected={selectedIndex === i}
          />
        ))}
        {candidates.length > limit && (
          <div className="counter">
            {`${candidates.length - limit} more links`}
          </div>
        )}
      </div>
    </>
  );
};
