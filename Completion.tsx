/// <reference no-default-lib="true" />
/// <reference lib="esnext" />
/// <reference lib="dom" />
/** @jsx h */
/** @jsxFrag Fragment */

import {
  Fragment,
  h,
  Ref,
  useCallback,
  useEffect,
  useMemo,
} from "./deps/preact.tsx";
import { Scrapbox, textInput } from "./deps/scrapbox.ts";
import {
  Candidate as CandidateComponent,
  CandidateProps,
} from "./Candidate.tsx";
import { SelectInit, useSelect } from "./useSelect.ts";
import { usePosition } from "./usePosition.ts";
import { SearchResult, useSearch } from "./useSearch.ts";
import { Candidate } from "./source.ts";
import {
  useProjectFilter,
  UseProjectFilterResult,
} from "./useProjectFilter.ts";
import { useOS } from "./useOS.ts";
import { UseLifecycleResult } from "./useLifecycle.ts";
import { CompletionState } from "./reducer.ts";
import { detectURL } from "./detectURL.ts";
declare const scrapbox: Scrapbox;

export interface CompletionProps extends
  Pick<
    UseLifecycleResult,
    "confirmAfter" | "cancel" | "freezeUntil"
  >,
  Omit<CompletionState, "type"> {
  limit: number;
  enableSelfProjectOnStart: boolean;
  callback: (operators?: Operators) => void;
  mark: Record<string, string | URL>;
  projects: Set<string>;
  source: Candidate[];
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
    position,
    query,
    start,
    context,
    limit,
    enableSelfProjectOnStart,
    callback,
    projects,
    source,
    mark,
    confirmAfter,
    cancel,
    freezeUntil,
  }: CompletionProps,
) => {
  /** 検索結果 */
  const { projectScore, items, progress } = useSearch(
    context === "input" ? query.slice(1, -1) : query,
    source,
  );

  const { projects: enableProjects, set } = useProjectFilter(projects, {
    enableSelfProjectOnStart,
  });

  const { ref, top, left, right } = usePosition({
    line: position.line,
    char: start,
  });
  const os = useOS();

  return (
    <>
      <SourceFilter
        itemCount={items.length}
        {...{
          enableProjects,
          projects,
          projectScore,
          freezeUntil,
          mark,
          top,
          right,
          set,
          os,
        }}
      />
      <ItemList
        divRef={ref}
        {...{
          start,
          confirmAfter,
          cancel,
          query,
          enableProjects,
          projects,
          items,
          top,
          left,
          progress,
          callback,
          limit,
          mark,
          os,
        }}
      />
    </>
  );
};

interface ItemListProps extends
  Pick<
    CompletionProps & SearchResult & h.JSX.CSSProperties,
    | "start"
    | "confirmAfter"
    | "cancel"
    | "query"
    | "items"
    | "progress"
    | "callback"
    | "limit"
    | "mark"
    | "top"
    | "left"
  > {
  /** <div />にアクセスするためのref object
   *
   * `ref`だと干渉するので、名前を変えた
   */
  divRef: Ref<HTMLDivElement>;
  enableProjects: string[];
  projects: Set<string>;
  os: string;
}

const ItemList = (
  {
    start,
    divRef,
    confirmAfter,
    cancel,
    query,
    enableProjects,
    projects,
    items,
    top,
    left,
    progress,
    callback,
    limit,
    mark,
    os,
  }: ItemListProps,
) => {
  /** 補完候補を挿入する函数
   *
   * 起動している補完の種類に応じて挙動を変える
   */
  const confirm = useCallback((title: string, project?: string) => {
    const text = project ? `[/${project}/${title}]` : `[${title}]`;
    // ユーザーが文字を入力したと補完判定で誤認識されないよう、一旦補完を切ってから編集する
    confirmAfter((
      prev,
      { line },
    ) => [
      `${[...prev].slice(0, start).join("")}${text}${
        [...prev].slice(start + [...query].length).join("")
      }`,
      { line, char: start + [...text].length },
    ]);
  }, [start, query]);

  /** 補完ソースに外部projectが含まれているかどうか
   *
   * 含まれている場合は<Mark />を表示する
   */
  const isExternalProjectMode = useMemo(
    () => projects.size > 1 || !projects.has(scrapbox.Project.name),
    [projects],
  );

  // 表示する候補のみ、UI用データを作る
  const candidatesProps = useMemo<Omit<CandidateProps, "selected">[]>(() => {
    // 絞り込みをかけながら変換する
    const result: Omit<CandidateProps, "selected">[] = [];
    for (const item of items) {
      if (result.length === limit) break;
      if (!item.projects.some((project) => enableProjects.includes(project))) {
        continue;
      }

      result.push({
        title: item.title,
        projects: item.projects.flatMap((project) =>
          enableProjects.includes(project)
            ? [{
              name: project,
              mark: isExternalProjectMode
                ? detectURL(mark[project] ?? "", import.meta.url) || project[0]
                : "",
              confirm: () => confirm(item.title, project),
            }]
            : []
        ),
        confirm: () => confirm(item.title),
      });
    }

    return result;
  }, [enableProjects, isExternalProjectMode, items, limit, mark, confirm]);

  // 候補選択
  const { selectedId, next, prev, selectLast, selectFirst } = useSelect(
    candidatesProps,
    selector,
  );
  const confirmSelected = useCallback(
    () =>
      selectedId === null
        ? false
        : (candidatesProps.find((candidate) =>
          selector(candidate) === selectedId
        )?.confirm?.(),
          true),
    [selectedId, candidatesProps],
  );
  useEffect(() =>
    callback(
      candidatesProps.length === 0 ? undefined : {
        selectNext: (init?: SelectInit) => (next(init), true),
        selectPrev: (init?: SelectInit) => (prev(init), true),
        selectFirst: () => (selectFirst(), true),
        selectLast: () => (selectLast(), true),
        confirm: confirmSelected,
        cancel: () => (cancel(), true),
      } as const,
    ), [
    callback,
    next,
    prev,
    selectFirst,
    selectLast,
    confirmSelected,
  ]);

  /** 補完windowのスタイル */
  const style = useMemo<h.JSX.CSSProperties>(
    () =>
      // undefinedとnullをまとめて判定したいので、厳密比較!==は使わない
      candidatesProps.length > 0 && top != null &&
        left != null
        ? { top, left }
        : { display: "none" },
    [candidatesProps.length, top, left],
  );

  return (
    <div
      ref={divRef}
      className="container candidates"
      data-os={os}
      style={style}
    >
      {candidatesProps.map((props) => (
        <CandidateComponent
          key={props.title}
          {...props}
          selected={selectedId === props.title}
        />
      ))}
      {items.length > limit && (
        <div className="counter">
          {`${items.length - limit} more links`}
        </div>
      )}
      <div
        className="progress"
        style={`background:  linear-gradient(to right, var(--select-suggest-border-color, #eee) ${
          (progress * 100).toPrecision(3)
        }%, transparent ${(progress * 100).toPrecision(3)}%)`}
      />
    </div>
  );
};

interface SourceFilterProps extends
  Pick<
    & CompletionProps
    & SearchResult
    & h.JSX.CSSProperties
    & UseProjectFilterResult,
    | "mark"
    | "top"
    | "right"
    | "set"
    | "projectScore"
    | "freezeUntil"
  > {
  enableProjects: string[];
  projects: Set<string>;
  os: string;
  itemCount: number;
}

const SourceFilter = (
  {
    enableProjects,
    projects,
    projectScore,
    mark,
    itemCount,
    top,
    right,
    set,
    os,
    freezeUntil,
  }: SourceFilterProps,
) => {
  // projectの絞り込み
  const projectProps = useMemo(() =>
    // 予め設定されたprojectsから、検索で見つかったもののみ表示する
    [...projects].sort((a, b) =>
      (projectScore.get(b) ?? 0) - (projectScore.get(a) ?? 0)
    ).flatMap((project) =>
      projectScore.has(project)
        ? [{
          name: project,
          enable: enableProjects.includes(project),
          mark: detectURL(mark[project] ?? "", import.meta.url) || project[0],
          score: projectScore.get(project)!,
          onClick: () =>
            freezeUntil(() => {
              set(project, !enableProjects.includes(project));
              textInput()!.focus();
            }),
        }]
        : []
    ), [projects, projectScore, enableProjects, mark]);

  /** project絞り込みパネルのスタイル
   *
   * projectが一つしか指定されていなければ表示しない
   *
   * 非表示の検索候補があれば表示し続ける
   */
  const style = useMemo<h.JSX.CSSProperties>(
    () =>
      // undefinedとnullをまとめて判定したいので、厳密比較!==は使わない
      itemCount > 0 && top != null &&
        right != null &&
        projects.size > 1
        ? { top, right }
        : { display: "none" },
    [top, right, itemCount, projects.size],
  );

  return (
    <div
      className="container projects"
      data-os={os}
      style={style}
    >
      {projectProps.map((props) => <Mark key={props.name} {...props} />)}
    </div>
  );
};

const Mark = (
  props: {
    enable: boolean;
    name: string;
    score: number;
    onClick: h.JSX.MouseEventHandler<HTMLDivElement>;
    mark: URL | string;
  },
) => (
  <div
    className={props.enable ? "mark" : "mark disabled"}
    data-score={props.score.toPrecision(3)}
    onClick={props.onClick}
    title={props.name}
  >
    {props.mark instanceof URL
      ? <img src={props.mark.href} />
      : `[${props.mark}]`}
  </div>
);

const selector = <T extends { title: string }>(item: T): string => item.title;
