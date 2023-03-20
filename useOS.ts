import { useMemo } from "./deps/preact.tsx";

/** UserAgent判定 */
export const useOS = () =>
  useMemo(() => document.documentElement.dataset.os ?? "", []);
