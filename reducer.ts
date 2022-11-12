import { Cursor, Range } from "./deps/scrapbox.ts";

export type State = {
  state: "idle";
} | {
  state: "completion";
  query: string;
  context: "selection";
  results: { title: string; projects: string[] }[];
  range: Range;
  cursor: Cursor;
} | {
  state: "canceled";
} | {
  state: "disabled";
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
  range: Range;
  cursor: Cursor;
} | {
  type: "sendresults";
  query: string;
  results: { title: string; projects: string[] }[];
} | {
  type: "cancel";
};

export const reducer = (state: State, action: Action): State => {
  if (state.state === "disabled") {
    return action.type === "enable" ? { state: "idle" } : state;
  }
  switch (action.type) {
    case "completionupdate":
      return state.state === "canceled" ? state : {
        state: "completion",
        context: action.context,
        results: [],
        query: action.query,
        range: action.range,
        cursor: action.cursor,
      };
    case "sendresults":
      return state.state !== "completion" || action.query !== state.query
        ? state
        : {
          state: "completion",
          results: action.results,
          context: state.context,
          query: state.query,
          range: state.range,
          cursor: state.cursor,
        };
    case "completionend":
      return { state: "idle" };
    case "cancel":
      return { state: "canceled" };
    case "disable":
      return { state: "disabled" };
    case "enable":
      return state;
  }
};
