import { setup } from "../mod.tsx";

const ops = await setup();

document.getElementById("text-input")!.addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;

  switch (e.key) {
    case "Tab": {
      const executed = e.shiftKey
        ? ops.selectPrev({ cyclic: true })
        : ops.selectNext({ cyclic: true });
      if (!executed) return;
      break;
    }
    case "Enter": {
      if (e.shiftKey) return;
      if (!ops.confirm()) return;
      break;
    }
    case "Escape": {
      if (e.shiftKey) return;
      if (!ops.cancel()) return;
      break;
    }
    default:
      return;
  }
  e.preventDefault();
  e.stopPropagation();
});
