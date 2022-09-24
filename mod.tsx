/** @jsx h */

import { h, render } from "./deps/preact.tsx";
import { SelectInit } from "./useSelect.ts";
import { App, Operators, Options } from "./App.tsx";
export type { Operators, Options, SelectInit };

/** scrapbox-select-suggestionを起動する
 *
 * @param options 初期設定
 * @return このUserScriptの操作函数で解決されるPromise
 */
export const setup = (options?: Options): Promise<Operators> => {
  const app = document.createElement("div");
  app.dataset.userscriptName = "選択範囲に似ているリンクを入力補完するUserScript";
  const shadowRoot = app.attachShadow({ mode: "open" });
  document.body.append(app);
  return new Promise<Operators>(
    (resolve) =>
      render(<App {...options ?? {}} callback={resolve} />, shadowRoot),
  );
};
