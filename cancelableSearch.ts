import { MatchInfo } from "./search.ts";
import { Candidate } from "./source.ts";
import { createDebug } from "./deps/debug.ts";
import type {
  CancelRequest,
  LoadProgress,
  LoadRequest,
  SearchProgress,
  SearchRequest,
  WorkerError,
} from "./search.worker.ts";

const logger = createDebug("scrapbox-select-suggestion:cancelableSearch.ts");

// Generate unique ID for each search operation
let searchIdCounter = 0;
const generateSearchId = (): string =>
  `search_${++searchIdCounter}_${Date.now()}`;

export interface CancelableSearch extends Disposable {
  /** データを読み込む
   *
   * @param projects 読み込み対象のプロジェクトリスト
   */
  load(projects: Iterable<string>): Promise<number>;

  /** 中断可能な検索を開始する
   *
   * @param query 検索クエリ
   * @param [chunk=5000] 一度に検索する候補の最大数
   */
  search(
    query: string,
    chunk?: number,
  ): ReadableStream<[candidates: (Candidate & MatchInfo)[], progress: number]>;
}

/** 中断可能な検索 */
export const makeCancelableSearch = (
  workerUrl: string | URL,
): CancelableSearch => {
  const worker = new Worker(workerUrl, { type: "module" });

  return {
    load: (projects) => load(projects, worker),

    search: (query, chunk) => search(query, chunk ?? 5000, worker),

    [Symbol.dispose]: () => {
      worker.terminate();
      logger.debug("worker terminated.");
    },
  };
};

const load = async (
  projects: Iterable<string>,
  worker: Worker,
): Promise<number> => {
  logger.debug("start loading source");
  const id = generateSearchId();

  // Wait for load completion
  const promise = new Promise<LoadProgress>(
    (resolve, reject) => {
      const controller = new AbortController();

      worker.addEventListener("message", (
        { data }: MessageEvent<LoadProgress | WorkerError>,
      ) => {
        if (data.id !== id) return;
        if (data.type === "error") {
          controller.abort();
          reject(new Error(data.error));
          return;
        }
        controller.abort();
        resolve(data);
      }, { signal: controller.signal });
      worker.addEventListener("error", (event) => {
        controller.abort();
        reject(event);
      }, { signal: controller.signal });
    },
  );

  worker.postMessage(
    {
      type: "load",
      id,
      projects: [...projects],
    } satisfies LoadRequest,
  );

  return (await promise).candidateCount;
};

const search = (
  query: string,
  chunk: number,
  worker: Worker,
): ReadableStream<
  [candidates: (Candidate & MatchInfo)[], progress: number]
> => {
  logger.debug("start searching: ", query);
  if (!query.trim()) {
    return new ReadableStream({
      start(controller) {
        controller.close();
      },
    });
  }

  const id = generateSearchId();
  const abortController = new AbortController();
  const start = new Date();

  const dispose = () => {
    abortController.abort();
    const end = new Date();
    const ms = end.getTime() - start.getTime();
    logger.debug(
      `WebWorker search completed for "${query}" in ${ms}ms`,
    );
  };

  return new ReadableStream({
    start(controller) {
      worker.addEventListener("message", (
        { data }: MessageEvent<SearchProgress | WorkerError>,
      ) => {
        if (data.id !== id) return;
        if (data.type === "error") {
          controller.error(new Error(data.error));
          cancel(worker, id);
          dispose();
          return;
        }

        controller.enqueue([data.candidates, data.progress]);
        if (data.completed) {
          controller.close();
          dispose();
        }
      }, { signal: abortController.signal });
      worker.addEventListener("error", (event) => {
        controller.error(event);
        cancel(worker, id);
        dispose();
      }, { signal: abortController.signal });

      worker.postMessage(
        {
          type: "search",
          id: id,
          query,
          chunk,
        } satisfies SearchRequest,
      );
    },
    cancel() {
      cancel(worker, id);
      dispose();
    },
  });
};

const cancel = (worker: Worker, id: string) => {
  worker.postMessage({ type: "cancel", id } satisfies CancelRequest);
};
