/// <reference no-default-lib="true" />
/// <reference lib="esnext" />
/// <reference lib="dom" />
/** @jsx h */
/** @jsxFrag Fragment */

import { Fragment, h, useCallback } from "./deps/preact.tsx";
import { encodeTitleURI } from "./deps/scrapbox.ts";

export interface CandidateProps {
  title: string;
  projects: {
    name: string;
    mark: string | URL;
    confirm: () => void;
  }[];
  confirm: () => void;
  selected: boolean;
}

export const Candidate = (
  { title, projects, selected, confirm }: CandidateProps,
) => {
  const handleClick = useCallback(
    (e: h.JSX.TargetedMouseEvent<HTMLAnchorElement>) => {
      // 修飾キーが押されていないときのみ確定する
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      e.preventDefault();
      e.stopPropagation();
      confirm();
    },
    [confirm],
  );

  return (
    <div
      className={`candidate${selected ? " selected" : ""}`}
    >
      <a
        tabIndex={0}
        role="menuitem"
        href={`./${encodeTitleURI(title)}`}
        onClick={handleClick}
      >
        {title}
      </a>
      {projects.map((project) => (
        <Mark
          project={project.name}
          title={title}
          mark={project.mark}
          confirm={project.confirm}
        />
      ))}
    </div>
  );
};

interface MarkProps {
  project: string;
  title: string;
  /** 空文字の場合は、何も表示しない */
  mark: string | URL;
  confirm: () => void;
}

const Mark = (
  { project, title, mark, confirm }: MarkProps,
) => {
  const handleClick = useCallback(
    (e: h.JSX.TargetedMouseEvent<HTMLAnchorElement>) => {
      // 修飾キーが押されていないときのみ確定する
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      e.preventDefault();
      e.stopPropagation();
      confirm();
    },
    [confirm],
  );

  return (mark === ""
    ? (
      <>
      </>
    )
    : (
      <a
        className="mark"
        tabIndex={0}
        href={`../${project}/${encodeTitleURI(title)}`}
        onClick={handleClick}
      >
        {mark instanceof URL ? <img src={mark.href} /> : `[${mark}]`}
      </a>
    ));
};
