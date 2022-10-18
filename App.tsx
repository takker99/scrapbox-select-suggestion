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
import { sort } from "./search.ts";
import { insertText, Scrapbox } from "./deps/scrapbox.ts";
export { setDebugMode } from "./debug.ts";
declare const scrapbox: Scrapbox;

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
  hideSelfMark: boolean;
  debug?: boolean;
}

export const App = (props: AppProps) => {
  const { limit, callback, projects, debug, mark, hideSelfMark } = props;

  const { text, range } = useSelection();
  const [frag, setFrag] = useFrag(text, range);
  const source = useSource(projects);

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
    setCandidates([]); // 以前のを消して、描画がちらつかないようにする
    if (frag !== "enable") return;
    if (text.trim() === "") return;

    return incrementalSearch(text, source, (candidates) =>
      setCandidates(
        sort(candidates, projects)
          .map((page) => ({
            title: page.title,
            projects: page.metadata.map(({ project }) => ({
              name: project,
              mark: hideSelfMark && project === scrapbox.Project.name
                ? ""
                : detectURL(mark[project] ?? "", location.href) || project[0],
              confirm: () => insertText(`[/${project}/${page.title}]`),
            })),
            confirm: () => insertText(`[${page.title}]`),
          })),
      ));
  }, [text, source, frag, projects, hideSelfMark]);

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
          const candidateEl = ref.current?.querySelector?.(
            ".candidate.selected a.button",
          );
          return candidateEl instanceof HTMLAnchorElement
            ? (candidateEl.click(), true)
            : false;
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
}
a:not(.mark) {
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
