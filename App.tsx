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
import { filter, sort } from "./search.ts";
import { Candidate, insertText, Scrapbox } from "./deps/scrapbox.ts";
declare const scrapbox: Scrapbox;

export interface Options {
  /** 表示する最大候補数
   *
   * @default 5
   */
  limit?: number;
}
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

export interface AppProps extends Options {
  callback: (operators: Operators) => void;
}

export const App = (props: AppProps) => {
  const { limit = 5, callback } = props;

  const { text, range } = useSelection();
  const [frag, setFrag] = useFrag(text, range);

  const [candidates, setCandidates] = useState<{
    title: string;
    confirm: () => void;
  }[]>([]);
  const makeSource = useSource();
  useEffect(() => {
    if (frag !== "enable") return;
    if (text.trim() === "") return;

    let terminate = false;
    let timer: number | undefined;
    (async () => {
      const candidates: (Candidate & { point: number })[] = [];
      const update = () => {
        setCandidates(
          sort(candidates)
            .map((page) => ({
              title: page.title,
              confirm: () => insertText(`[${page.title}]`),
            })),
        );
        timer = undefined;
      };

      // 検索する
      const source = makeSource(); // ここで生成したソースを使う
      for (const results of filter(text, source)) {
        // 検索中断命令を受け付けるためのinterval
        await new Promise((resolve) => requestAnimationFrame(resolve));
        if (terminate) return;

        candidates.push(...results);
        if (timer !== undefined) continue;
        update();
        timer = setTimeout(update, 500);
      }
    })();

    // 検索を中断させえる
    return () => {
      terminate = true;
      clearTimeout(timer);
    };
  }, [text, frag]);

  const { ref, top, left } = usePosition(range);

  const visibleCandidateCount = Math.min(candidates.length, limit);
  const { selectedIndex, next, prev, selectFirst, selectLast } = useSelect(
    visibleCandidateCount,
  );

  /** windowの開閉およびwindows操作の有効状態を決めるフラグ */
  const isOpen = useMemo(
    () => {
      return frag === "enable" && candidates.length > 0 && top !== undefined &&
        left !== undefined;
    },
    [frag, candidates.length, top, left],
  );

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

  const divStyle = useMemo<h.JSX.CSSProperties>(
    () => !isOpen ? { display: "none" } : { top, left },
    [isOpen, top, left],
  );

  return (
    <>
      <style>
        {`
      .container {
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
      a.candidate {
        display: block;
        text-decoration: none;
        color: inherit;
      }
      a.candidate.selected {
        background-color: var(--select-suggest-selected-bg, #222);
        text-decoration: underline
      }
      .counter {
        color: var(--select-suggest-information-text-color, #aaa);
        font-size: 80%;
        font-style: italic;
      }
    `}
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
