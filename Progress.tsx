import { FunctionComponent } from "./deps/preact.tsx";

export const Progress: FunctionComponent<{ progress: number }> = (
  { progress },
) => (
  <div
    className="progress"
    style={`background:  linear-gradient(to right, var(--select-suggest-border-color, #eee) ${
      (progress * 100).toPrecision(3)
    }%, transparent ${(progress * 100).toPrecision(3)}%)`}
  />
);
