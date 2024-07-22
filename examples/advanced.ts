import { setup, SetupInit } from "../mod.tsx";
import { addTextInputEventListener } from "../deps/scrapbox.ts";

export const launch = async (init?: SetupInit) => {
  const ops = await setup(init);

  addTextInputEventListener("keydown", (e) => {
    if (e.metaKey || e.altKey) return;

    switch (e.key) {
      case "Tab": {
        if (e.ctrlKey) return;
        if (e.altKey) return;
        const executed = e.shiftKey
          ? ops.selectPrev?.({ cyclic: true })
          : ops.selectNext?.({ cyclic: true });
        if (!executed) return;
        break;
      }
      case "Enter": {
        if (e.shiftKey) return;
        if (e.ctrlKey) return;
        if (e.altKey) return;
        if (!ops.confirm?.()) return;
        break;
      }
      case "i": {
        if (e.shiftKey) return;
        if (!e.ctrlKey) return;
        if (e.altKey) return;
        if (!ops.confirm?.({ icon: true })) return;
        break;
      }
      case "Escape": {
        if (e.shiftKey) return;
        if (e.ctrlKey) return;
        if (e.altKey) return;
        if (!ops.cancel?.()) return;
        break;
      }
      default:
        return;
    }
    e.preventDefault();
    e.stopPropagation();
  });
};
