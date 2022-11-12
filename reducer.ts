import type { Position } from "./deps/scrapbox.ts";
export type State =
  | {
    state: "idle" | "canceled" | "disabled";
    context?: "selection" | "input";
    query: string;
    range?: { start: number; end: number };
    position?: Position;
  }
  | {
    state: "completion";
    context: "selection";
    query: string;
    range?: { start: number; end: number };
    position: Position;
  }
  | {
    state: "completion";
    context: "input";
    query: string;
    range: { start: number; end: number };
    position: Position;
  };

export type Action = {
  type: "disable";
} | {
  type: "enable";
} | {
  type: "completionend";
} | {
  type: "completionupdate";
  query: string;
  context: "selection";
  position: { line: number; char: number };
} | {
  type: "completionupdate";
  query: string;
  context: "input";
  range: { start: number; end: number };
  position: { line: number; char: number };
} | {
  type: "cancel";
};

export const reducer = (state: State, action: Action): State => {
  const { state: _, ...props } = state;
  if (_ === "disabled") {
    return action.type === "enable" ? { state: "idle", ...props } : state;
  }

  switch (action.type) {
    case "completionupdate": {
      const { type: _, ...props } = action;
      return state.state === "canceled" ? state : {
        state: "completion",
        ...props,
      };
    }
    case "completionend":
      return _ === "idle" ? state : { state: "idle", ...props };
    case "cancel":
      return _ === "canceled" ? state : { state: "canceled", ...props };
    case "disable":
      return { state: "disabled", ...props };
    case "enable":
      return state;
  }
};
