/// <reference no-default-lib="true" />
/// <reference lib="esnext" />
/// <reference lib="dom" />
/** @jsx h */

import { h, useCallback } from "./deps/preact.tsx";
import { encodeTitleURI } from "./deps/scrapbox.ts";

export interface CandidateProps {
  title: string;
  confirm: () => void;
  selected: boolean;
}

export const Candidate = ({ title, selected, confirm }: CandidateProps) => {
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
    <a
      className={`candidate${selected ? " selected" : ""}`}
      tabIndex={0}
      role="menuitem"
      href={`./${encodeTitleURI(title)}`}
      onClick={handleClick}
    >
      {title}
    </a>
  );
};
