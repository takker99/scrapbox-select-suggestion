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
import { useProjectFilter } from "./useProjectFilter.ts";
import { Candidate as CandidateComponent } from "./Candidate.tsx";
import { SelectInit, useSelect } from "./useSelect.ts";
import { detectURL } from "./detectURL.ts";
import { logger } from "./debug.ts";
import { incrementalSearch } from "./incrementalSearch.ts";
import { sort } from "./search.ts";
import { insertText, Scrapbox } from "./deps/scrapbox.ts";
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
}

export const App = (props: AppProps) => {
  const { limit, callback, projects, mark, hideSelfMark } = props;

  const { text, range } = useSelection();
  const [frag, setFrag] = useFrag(text, range);
  const source = useSource(projects);
  const { projects: enables, set } = useProjectFilter(projects);

  // 検索
  const [candidates, setCandidates] = useState<
    { title: string; projects: string[] }[]
  >([]);
  useEffect(() => {
    setCandidates([]); // 以前のを消して、描画がちらつかないようにする
    if (frag !== "enable") return;
    if (text.trim() === "") return;

    return incrementalSearch(text, source, (candidates) =>
      setCandidates(
        sort(candidates, projects)
          .map((page) => ({
            title: page.title,
            projects: page.metadata.map(({ project }) => project),
          })),
      ));
  }, [text, source, frag]);

  // 表示する候補のみ、UI用データを作る
  const candidatesProps = useMemo(() => {
    logger.time("filtering by projects");
    const result = candidates
      .filter((candidate) =>
        candidate.projects.some((project) => enables.includes(project))
      )
      .map((candidate) => ({
        title: candidate.title,
        projects: candidate.projects.flatMap((project) =>
          enables.includes(project)
            ? [{
              name: project,
              mark: hideSelfMark && project === scrapbox.Project.name
                ? ""
                : detectURL(mark[project] ?? "", import.meta.url) || project[0],
              confirm: () => insertText(`[/${project}/${candidate.title}]`),
            }]
            : []
        ),
        confirm: () => insertText(`[${candidate.title}]`),
      }));
    logger.timeEnd("filtering by projects");

    return result;
  }, [enables, candidates, mark, hideSelfMark]);

  // 候補選択
  const visibleCandidateCount = Math.min(candidatesProps.length, limit);
  const { selectedIndex, next, prev, selectFirst, selectLast } = useSelect(
    visibleCandidateCount,
  );

  // projectの絞り込み
  const projectProps = useMemo(() => {
    // 見つかったprojects
    const found = new Set<string>();
    for (const candidate of candidates) {
      for (const project of candidate.projects) {
        found.add(project);
      }
    }
    return projects.flatMap((project) =>
      found.has(project)
        ? [{
          name: project,
          enable: enables.includes(project),
          mark: detectURL(mark[project] ?? "", import.meta.url) || project[0],
          onClick: () => set(project, !enables.includes(project)),
        }]
        : []
    );
  }, [candidates, projects, enables, mark]);

  // スタイル設定
  const { ref, top, left, right } = usePosition(range);
  /** windowの開閉およびwindows操作の有効状態を決めるフラグ */
  const isOpen = useMemo(
    () =>
      frag === "enable" && candidatesProps.length > 0 &&
      top !== undefined &&
      left !== undefined,
    [frag, candidatesProps.length, top, left],
  );
  /** 補完windowのスタイル */
  const divStyle = useMemo<h.JSX.CSSProperties>(
    () => !isOpen ? { display: "none" } : { top, left },
    [isOpen, top, left],
  );
  /** project絞り込みパネルのスタイル
   *
   * projectが一つしか指定されていなければ表示しない
   *
   * 非表示の検索候補があれば表示し続ける
   */
  const projectFilterStyle = useMemo<h.JSX.CSSProperties>(
    () =>
      (!isOpen && candidates.length === 0) || projects.length < 1
        ? { display: "none" }
        : { top, right },
    [isOpen, top, right, candidates.length, projects.length],
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
  margin-top: 14px;
  max-height: 80vh;
  z-index: 301;

  background-color: var(--select-suggest-bg, #111);
  font-family: var(--select-suggest-font-family, "Open Sans", Helvetica, Arial, "Hiragino Sans", sans-serif);
  color: var(--select-suggest-text-color, #eee);
  border-radius: 4px;
}
.candidates {
  max-width: 80vw;
}
.projects {
  max-width: 10vw;
  margin-right: 4px;
}
.container.candidates > :not(:first-child) {
  border-top: 1px solid var(--select-suggest-border-color, #eee);
}
.container.candidates > *{
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
img {
  height: 1.3em;
  width: 1.3em;
  position: relative;
  object-fit: cover;
  object-position: 0% 0%;
}
.disabled {
  filter: grayscale(1.0) opacity(0.5);
}
.counter {
  color: var(--select-suggest-information-text-color, #aaa);
  font-size: 80%;
  font-style: italic;
}`}
      </style>
      <div className="container projects" style={projectFilterStyle}>
        {projectProps.map((props) => (
          <div
            className={props.enable ? "mark" : "mark disabled"}
            onClick={props.onClick}
          >
            {props.mark instanceof URL
              ? <img src={props.mark.href} />
              : `[${props.mark}]`}
          </div>
        ))}
      </div>
      <div className="container candidates" ref={ref} style={divStyle}>
        {candidatesProps.slice(0, visibleCandidateCount).map((props, i) => (
          <CandidateComponent
            key={props.title}
            {...props}
            selected={selectedIndex === i}
          />
        ))}
        {candidatesProps.length > limit && (
          <div className="counter">
            {`${candidatesProps.length - limit} more links`}
          </div>
        )}
      </div>
    </>
  );
};
