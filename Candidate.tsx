/** @jsxRuntime automatic */
/** @jsxImportSource npm:preact@10 */
import { ConfirmInit } from "./Completion.tsx";
import { h, useCallback } from "./deps/preact.tsx";
import { encodeTitleURI } from "./deps/scrapbox-title.ts";

export interface CandidateProps {
  title: string;
  projects: {
    name: string;
    mark: string | URL;
    confirm: (init?: ConfirmInit) => void;
  }[];
  confirm: (init?: ConfirmInit) => void;
  selected: boolean;
}

export const Candidate = (
  { title, projects, selected, confirm }: CandidateProps,
) => (
  <div
    className={`candidate${selected ? " selected" : ""}`}
  >
    <Button title={title} confirm={confirm} />
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

interface ButtonProps {
  title: string;
  confirm: () => void;
}

const Button = (
  { title, confirm }: ButtonProps,
) => (
  <a
    className="button"
    tabIndex={0}
    role="menuitem"
    href={`./${encodeTitleURI(title)}`}
    onClick={useConfirm(confirm)}
  >
    {title}
  </a>
);

export interface MarkProps {
  project: string;
  title: string;
  /** 空文字の場合は、何も表示しない */
  mark: string | URL;
  confirm: () => void;
}

export const Mark = (
  { project, title, mark, confirm }: MarkProps,
) => (mark === "" ? null : (
  <a
    className="mark"
    tabIndex={0}
    href={`../${project}/${encodeTitleURI(title)}`}
    onClick={useConfirm(confirm)}
    title={`/${project}/${encodeTitleURI(title)}`}
  >
    {mark instanceof URL ? <img src={mark.href} /> : `[${mark}]`}
  </a>
));

/** 修飾キーが押されていないときのみ確定する event handlerを作るhook */
const useConfirm = (confirm: () => void) =>
  useCallback(
    (e: h.JSX.TargetedMouseEvent<HTMLAnchorElement>) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      e.preventDefault();
      e.stopPropagation();
      confirm();
    },
    [confirm],
  );
