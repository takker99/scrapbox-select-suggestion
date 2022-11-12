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
import { insertText, Range, Scrapbox } from "./deps/scrapbox.ts";
import {
  Candidate as CandidateComponent,
  CandidateProps,
} from "./Candidate.tsx";
import { SelectInit, useSelect } from "./useSelect.ts";
import { useSource } from "./useSource.ts";
import { incrementalSearch } from "./incrementalSearch.ts";
import { sort } from "./search.ts";
import { useProjectFilter } from "./useProjectFilter.ts";
import { Action } from "./reducer.ts";
import { logger } from "./debug.ts";
import { detectURL } from "./detectURL.ts";
declare const scrapbox: Scrapbox;

export interface CompletionProps {
  query: string;
  range: Range;
  limit: number;
  hideSelfMark: boolean;
  enableSelfProjectOnStart: boolean;
  callback: (operators?: Operators) => void;
  mark: Record<string, string | URL>;
  projects: string[];
  position: Pick<h.JSX.CSSProperties, "top" | "left" | "right">;
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
    position: {
      top,
      left,
      right,
    },
    limit,
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
  useEffect(() =>
    incrementalSearch(
      query,
      source,
      (candidates) =>
        setCandidates(
          sort(candidates, projects)
            .map((page) => ({
              title: page.title,
              projects: page.metadata.map(({ project }) => project),
            })),
        ),
      { chunk: 5000 },
    ), [source, query]);

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
              confirm: () => {
                // ユーザーが文字を入力したと補完判定で誤認識されないよう、一旦補完を切ってから編集する
                dispatch({ type: "cancel" });
                insertText(`[/${project}/${candidate.title}]`);
              },
            }]
            : []
        ),
        confirm: () => {
          // ユーザーが文字を入力したと補完判定で誤認識されないよう、一旦補完を切ってから編集する
          dispatch({ type: "cancel" });
          insertText(`[${candidate.title}]`);
        },
      }));
    logger.timeEnd("filtering by projects");

    return result;
  }, [enableProjects, candidates, limit, mark, hideSelfMark]);

  // 候補選択
  const { selectedIndex, next, prev, selectLast, selectFirst } = useSelect(
    candidatesProps.length,
  );
  const confirm = useCallback(
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
        confirm,
        cancel: () => (dispatch({ type: "cancel" }), true),
      } as const,
    ), [
    callback,
    next,
    prev,
    selectFirst,
    selectLast,
    confirm,
  ]);

  /** 補完windowのスタイル */
  const listStyle = useMemo<h.JSX.CSSProperties>(
    () =>
      // undefinedとnullをまとめて判定したいので、厳密比較!==は使わない
      candidatesProps.length > 0 && top != null && left != null
        ? { top, left }
        : { display: "none" },
    [candidatesProps.length, top, left],
  );

  /** project絞り込みパネルのスタイル
   *
   * projectが一つしか指定されていなければ表示しない
   *
   * 非表示の検索候補があれば表示し続ける
   */
  const projectFilterStyle = useMemo<h.JSX.CSSProperties>(
    () =>
      candidates.length > 0 && top != null && right != null &&
        projects.length > 1
        ? { top, right }
        : { display: "none" },
    [top, right, candidates.length, projects.length],
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
          enable: enableProjects.includes(project),
          mark: detectURL(mark[project] ?? "", import.meta.url) || project[0],
          onClick: () => set(project, !enableProjects.includes(project)),
        }]
        : []
    );
  }, [candidates, projects, enableProjects, mark]);

  return (
    <>
      <div className="container projects" style={projectFilterStyle}>
        {projectProps.map((props) => <Mark {...props} />)}
      </div>
      <div className="container candidates" style={listStyle}>
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
