export type State = {
  state: "idle";
} | {
  state: "completion";
  query: string;
  context: "selection";
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
        query: action.query,
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
