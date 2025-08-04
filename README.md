# scrapbox-select-suggestion

Scrapboxで選択範囲に似ているリンクを入力補完するUserScript

## SharedWorker Support

This library now uses SharedWorker for improved performance and memory efficiency. When multiple tabs are open, they share a single worker instance, reducing memory usage. For platforms that don't support SharedWorker (such as Chrome for Android), the implementation automatically falls back to regular WebWorker.

The SharedWorker functionality is provided by a built-in polyfill that ensures cross-platform compatibility without requiring external dependencies.
