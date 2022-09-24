import { useCallback } from "./deps/preact.tsx";
import { Candidate, Scrapbox } from "./deps/scrapbox.ts";
declare const scrapbox: Scrapbox;

/** 補完ソースを提供するhook */
export const useSource = (): () => Candidate[] =>
  useCallback(() => scrapbox.Project.pages, []);
