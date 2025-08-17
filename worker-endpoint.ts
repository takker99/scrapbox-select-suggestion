import type { MatchInfo } from "./search.ts";
import type { Candidate } from "./source.ts";

/** Worker API exposed through Comlink */
export interface SearchWorkerAPI {
  load(projects: string[]): Promise<number>;
  search(
    query: string,
    chunk: number,
    onProgress: (
      candidates: (Candidate & MatchInfo)[],
      progress: number,
    ) => boolean,
  ): Promise<void>;
}
