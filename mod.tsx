/** @jsx h */

import { h, render } from "./deps/preact.tsx";
import { SelectInit } from "./useSelect.ts";
import { App, Operators } from "./App.tsx";
import { Scrapbox } from "./deps/scrapbox.ts";
export type { Operators, SelectInit };
declare const scrapbox: Scrapbox;

export interface SetupInit {
  /** 表示する最大候補数
   *
   * @default 5
   */
  limit?: number;

  /** `true` でdebug modeになる
   *
   * @default false
   */
  debug?: boolean;

  /** 補完ソースに含めるproject names
   *
   * @default `[scrapbox.Project.name]`
   */
  projects?: string[];
}

/** scrapbox-select-suggestionを起動する
 *
 * @param init 初期設定
 * @return このUserScriptの操作函数で解決されるPromise
 */
export const setup = (init?: SetupInit): Promise<Operators> => {
  const app = document.createElement("div");
  app.dataset.userscriptName = "scrapbox-select-suggestion";
  const shadowRoot = app.attachShadow({ mode: "open" });
  document.body.append(app);

  const { limit = 5, projects = [scrapbox.Project.name], debug } = init ??
    {};
  return new Promise<Operators>(
    (resolve) =>
      render(
        <App
          limit={limit}
          projects={projects}
          debug={debug}
          callback={resolve}
        />,
        shadowRoot,
      ),
  );
};
