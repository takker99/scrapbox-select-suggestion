export type State =
  | {
    state: "idle";
  }
  | {
    state: "completion";
    query: string;
    context: "selection";
  }
  | {
    state: "completion";
    query: string;
    context: "input";
    range: { start: number; end: number };
  }
  | {
    state: "canceled";
  }
  | {
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
} | {
  type: "completionupdate";
  query: string;
  context: "input";
  range: { start: number; end: number };
} | {
  type: "cancel";
};

export const reducer = (state: State, action: Action): State => {
  if (state.state === "disabled") {
    return action.type === "enable" ? { state: "idle" } : state;
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
      return { state: "idle" };
    case "cancel":
      return { state: "canceled" };
    case "disable":
      return { state: "disabled" };
    case "enable":
      return state;
  }
};
