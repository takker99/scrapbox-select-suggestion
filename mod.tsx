/** @jsx h */

import { h, render } from "./deps/preact.tsx";
import { SelectInit } from "./useSelect.ts";
import { App, Operators } from "./App.tsx";
import { Scrapbox } from "./deps/scrapbox.ts";
export type { Operators, SelectInit };
import { setDebugMode } from "./debug.ts";
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
   *
   * `enableSelfProjectOnStart`を`true`にすると、自動で`scrapbox.Project.name`が追加される
   */
  projects?: string[];

  /** 候補のソース元の識別子に使う文字列もしくはアイコンのURL
   *
   * defaultだと、project nameの頭文字が表示される
   */
  mark?: Record<string, string | URL>;

  /** 現在ページと同じprojectのアイコンを表示するかどうか
   *
   * @default true (表示しない)
   */
  hideSelfMark?: boolean;

  /** カスタムCSS
   *
   * URL or URL文字列の場合は、CSSファイルへのURLだとみなして<link />で読み込む
   * それ以外の場合は、インラインCSSとして<style />で読み込む
   */
  style?: URL | string;

  /** scriptを実行しているprojectのソースを、設定に関わらず無条件で有効にするかどうか
   *
   * @default true (ソースに含める)
   */
  enableSelfProjectOnStart?: boolean;
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

  const {
    limit = 5,
    debug = false,
    mark = {},
    style = "",
    hideSelfMark = true,
    enableSelfProjectOnStart = true,
  } = init ?? {};
  const projects = (() => {
    if (!init?.projects || init.projects.length === 0) {
      return [scrapbox.Project.name];
    }

    // フラグが立っているときのみ、現在projectを補完対象にする
    const projects = enableSelfProjectOnStart
      ? [scrapbox.Project.name, ...init.projects]
      : init.projects;

    // 重複を省く
    return projects.filter((project, i) =>
      !projects.some((p, j) => j < i && p === project)
    );
  })();

  setDebugMode(debug);
  return new Promise<Operators>(
    (resolve) =>
      render(
        <App
          limit={limit}
          projects={projects}
          mark={mark}
          hideSelfMark={hideSelfMark}
          style={style}
          callback={resolve}
          enableSelfProjectOnStart={enableSelfProjectOnStart}
        />,
        shadowRoot,
      ),
  );
};
