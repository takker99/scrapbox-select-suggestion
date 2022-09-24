import { useEffect, useState } from "./deps/preact.tsx";
import { Range, takeSelection } from "./deps/scrapbox.ts";

/** Scrapboxの選択範囲を検知するhook */
export const useSelection = (): { text: string; range: Range } => {
  const [range, setRange] = useState<Range>({
    start: { line: 0, char: 0 },
    end: { line: 0, char: 0 },
  });
  const [text, setText] = useState("");

  useEffect(() => {
    const selection = takeSelection();
    const update = () => {
      setRange(selection.getRange());
      setText(selection.getSelectedText());
    };
    selection.addChangeListener(update);
    return () => selection.removeChangeListener(update);
  }, []);

  return { text, range } as const;
};
