/** @jsxRuntime automatic */
/** @jsxImportSource npm:preact@10 */
import {
  type FunctionComponent,
  h,
  type RefCallback,
  useCallback,
  useEffect,
  useMemo,
} from "./deps/preact.tsx";
import { type Scrapbox, textInput } from "./deps/scrapbox.ts";
import {
  Candidate as CandidateComponent,
  type CandidateProps,
} from "./Candidate.tsx";
import { type SelectInit, useSelect } from "./useSelect.ts";
import { usePosition } from "./usePosition.ts";
import type { SearchResult } from "./useSearch.ts";
import {
  useProjectFilter,
  type UseProjectFilterResult,
} from "./useProjectFilter.ts";
import { useOS } from "./useOS.ts";
import type { UseLifecycleResult } from "./useLifecycle.ts";
import type { CompletionState } from "./reducer.ts";
import { detectURL } from "./detectURL.ts";
import { Progress } from "./Progress.tsx";
declare const scrapbox: Scrapbox;

export interface CompletionProps extends
  Pick<
    UseLifecycleResult,
    "confirmAfter" | "cancel" | "freezeUntil"
  >,
  Omit<CompletionState, "type">,
  SearchResult {
  limit: number;
  enableSelfProjectOnStart: boolean;
  callback: (operators?: OperatorBase) => void;
  mark: Record<string, string | URL>;
  projects: Set<string>;
}

export interface OperatorBase {
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
  confirm: (init?: ConfirmInit) => boolean;

  /** 一時的に補完を中断する
   *
   * 一旦補完条件から抜けるまで補完を実行しない
   *
   * @return 補完が開始されていなければ`false`
   */
  cancel: () => boolean;
}

export interface ConfirmInit {
  /** アイコン入力するとき`true` */
  icon?: boolean;
}

export const Completion: FunctionComponent<CompletionProps> = (
  {
    position,
    start,
    enableSelfProjectOnStart,
    projects,
    ...props
  },
) => {
  const { projects: enableProjects, set } = useProjectFilter(projects, {
    enableSelfProjectOnStart,
  });

  const { updateStandardElement, top, left, right } = usePosition({
    line: position.line,
    char: start,
  });
  const os = useOS();

  return (
    <>
      <SourceFilter
        itemCount={props.items.length}
        {...{
          enableProjects,
          projects,
          top,
          right,
          set,
          os,
        }}
        {...props}
      />
      <ItemList
        {...{
          updateStandardElement,
          start,
          enableProjects,
          projects,
          top,
          left,
          os,
        }}
        {...props}
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
  updateStandardElement: (element: Element | null) => void;
  enableProjects: string[];
  projects: Set<string>;
  os: string;
}

const ItemList = (
  {
    start,
    updateStandardElement,
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
  const confirm = useCallback(
    (title: string, project?: string, init?: ConfirmInit) => {
      const text = `[${project ? `/${project}/${title}` : title}${
        init?.icon ? ".icon" : ""
      }]`;

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
    },
    [start, query],
  );

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
              confirm: (init) => confirm(item.title, project, init),
            }]
            : []
        ),
        confirm: (init) => confirm(item.title, undefined, init),
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
    (init?: ConfirmInit) =>
      selectedId === null
        ? false
        : (candidatesProps.find((candidate) =>
          selector(candidate) === selectedId
        )?.confirm?.(init),
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
    candidatesProps.length,
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

  const ref: RefCallback<HTMLDivElement> = useCallback((element) => {
    if (!element) {
      updateStandardElement(element);
      return;
    }

    // 次のようなDOM構造を期待している:
    //
    // <div data-userscript-name="scrapbox-select-suggestion"> ← root.host
    //  #shadow-root (open) ← root
    //    <div class="container" /> ← element
    // </div >

    const root = element.parentNode;
    if (!(root instanceof ShadowRoot)) {
      throw Error(`The parent of "div.container" must be ShadowRoot`);
    }

    // `<div />`がroot要素になることはないので、`root.host.parentElement`は`null`にならないはず
    updateStandardElement(root.host.parentElement);
  }, [updateStandardElement]);

  return (
    <div
      ref={ref}
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
      <Progress progress={progress} />
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
