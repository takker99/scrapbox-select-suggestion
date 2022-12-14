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
  useMemo,
  useState,
} from "./deps/preact.tsx";
import {
  insertText,
  replaceLines,
  Scrapbox,
  takeCursor,
  textInput,
} from "./deps/scrapbox.ts";
import {
  Candidate as CandidateComponent,
  CandidateProps,
} from "./Candidate.tsx";
import { SelectInit, useSelect } from "./useSelect.ts";
import { useSource } from "./useSource.ts";
import { usePosition } from "./usePosition.ts";
import { incrementalSearch } from "./incrementalSearch.ts";
import { makeCompareAse } from "./sort.ts";
import { useProjectFilter } from "./useProjectFilter.ts";
import { Action, State } from "./reducer.ts";
import { logger } from "./debug.ts";
import { detectURL } from "./detectURL.ts";
declare const scrapbox: Scrapbox;

export interface CompletionProps {
  query: string;
  limit: number;
  context?: State["context"];
  state: State["state"];
  range?: State["range"];
  position?: State["position"];
  hideSelfMark: boolean;
  enableSelfProjectOnStart: boolean;
  callback: (operators?: Operators) => void;
  mark: Record<string, string | URL>;
  projects: string[];
  dispatch: (action: Action) => void;
}

export interface Operators {
  selectNext: (init?: SelectInit) => boolean;
  selectPrev: (init?: SelectInit) => boolean;
  selectFirst: () => boolean;
  selectLast: () => boolean;
  confirm: () => boolean;
  cancel: () => boolean;
}

export const Completion = (
  {
    query,
    position,
    state,
    limit,
    range,
    context,
    enableSelfProjectOnStart,
    callback,
    projects,
    dispatch,
    mark,
    hideSelfMark,
  }: CompletionProps,
) => {
  const { projects: enableProjects, set } = useProjectFilter(projects, {
    enableSelfProjectOnStart,
  });

  // 検索
  const source = useSource(projects);
  const [candidates, setCandidates] = useState<
    { title: string; projects: string[] }[]
  >([]);
  const compareAse = useMemo(() => makeCompareAse(projects), [projects]);
  useEffect(() => {
    if (state !== "completion") {
      setCandidates([]);
      return;
    }
    return incrementalSearch(
      query,
      source,
      (candidates) =>
        setCandidates(
          candidates.sort(compareAse).map((page) => ({
            title: page.title,
            projects: page.metadata.map(({ project }) => project),
          })),
        ),
      { chunk: 5000 },
    );
  }, [state, source, query, compareAse]);

  /** 補完候補を挿入する函数
   *
   * 起動している補完の種類に応じて挙動を変える
   */
  const confirm = useCallback((title: string, project?: string) => {
    // ユーザーが文字を入力したと補完判定で誤認識されないよう、一旦補完を切ってから編集する
    dispatch({ type: "cancel" });

    const text = project ? `[/${project}/${title}]` : `[${title}]`;
    if (context === "selection") {
      insertText(text);
      return;
    }
    const line = takeCursor().getPosition().line;
    if (scrapbox.Layout !== "page") return;
    const prev = scrapbox.Page.lines[line].text;

    replaceLines(
      line,
      line,
      `${prev.slice(0, range?.start ?? 0)}${text}${
        prev.slice((range?.end ?? 0) + 1)
      }`,
    );
  }, [context, range?.start, range?.end]);

  // 表示する候補のみ、UI用データを作る
  const candidatesProps = useMemo<Omit<CandidateProps, "selected">[]>(() => {
    logger.time("filtering by projects");
    const result = candidates
      .filter((candidate) =>
        candidate.projects.some((project) => enableProjects.includes(project))
      )
      .slice(0, limit)
      .map((candidate) => ({
        title: candidate.title,
        projects: candidate.projects.flatMap((project) =>
          enableProjects.includes(project)
            ? [{
              name: project,
              mark: hideSelfMark && project === scrapbox.Project.name
                ? ""
                : detectURL(mark[project] ?? "", import.meta.url) || project[0],
              confirm: () => confirm(candidate.title, project),
            }]
            : []
        ),
        confirm: () => confirm(candidate.title),
      }));
    logger.timeEnd("filtering by projects");

    return result;
  }, [enableProjects, candidates, limit, mark, hideSelfMark, confirm]);

  // 候補選択
  const { selectedIndex, next, prev, selectLast, selectFirst } = useSelect(
    candidatesProps.length,
  );
  const confirmSelected = useCallback(
    () =>
      selectedIndex === -1
        ? false
        : (candidatesProps.at(selectedIndex)?.confirm?.(), true),
    [selectedIndex, candidatesProps],
  );
  useEffect(() =>
    callback(
      candidatesProps.length === 0 ? undefined : {
        selectNext: (init?: SelectInit) => (next(init), true),
        selectPrev: (init?: SelectInit) => (prev(init), true),
        selectFirst: () => (selectFirst(), true),
        selectLast: () => (selectLast(), true),
        confirm: confirmSelected,
        cancel: () => (dispatch({ type: "cancel" }), true),
      } as const,
    ), [
    callback,
    next,
    prev,
    selectFirst,
    selectLast,
    confirmSelected,
  ]);

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
          enable: enableProjects.includes(project),
          mark: detectURL(mark[project] ?? "", import.meta.url) || project[0],
          onClick: () => {
            set(project, !enableProjects.includes(project));
            textInput()!.focus();
          },
        }]
        : []
    );
  }, [candidates, projects, enableProjects, mark]);

  const { ref, top, left, right } = usePosition(
    position ?? { line: 0, char: 0 },
  );

  /** 補完windowのスタイル */
  const listStyle = useMemo<h.JSX.CSSProperties>(
    () =>
      // undefinedとnullをまとめて判定したいので、厳密比較!==は使わない
      state === "completion" && candidatesProps.length > 0 && top != null &&
        left != null
        ? { top, left }
        : { display: "none" },
    [candidatesProps.length, top, left, state],
  );

  /** UserAgent判定 */
  const os = useMemo(() => document.documentElement.dataset.os ?? "", []);

  /** project絞り込みパネルのスタイル
   *
   * projectが一つしか指定されていなければ表示しない
   *
   * 非表示の検索候補があれば表示し続ける
   */
  const projectFilterStyle = useMemo<h.JSX.CSSProperties>(
    () =>
      state === "completion" && candidates.length > 0 && top != null &&
        right != null &&
        projects.length > 1
        ? { top, right }
        : { display: "none" },
    [top, right, candidates.length, projects.length, state],
  );

  return (
    <>
      <div
        className="container projects"
        data-os={os}
        style={projectFilterStyle}
      >
        {projectProps.map((props) => <Mark {...props} />)}
      </div>
      <div
        ref={ref}
        className="container candidates"
        data-os={os}
        style={listStyle}
      >
        {candidatesProps.map((props, i) => (
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

const Mark = (
  props: {
    enable: boolean;
    name: string;
    onClick: h.JSX.MouseEventHandler<HTMLDivElement>;
    mark: URL | string;
  },
) => (
  <div
    className={props.enable ? "mark" : "mark disabled"}
    onClick={props.onClick}
    title={props.name}
  >
    {props.mark instanceof URL
      ? <img src={props.mark.href} />
      : `[${props.mark}]`}
  </div>
);
