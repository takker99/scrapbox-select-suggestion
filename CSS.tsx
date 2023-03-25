/// <reference no-default-lib="true" />
/// <reference lib="esnext" />
/// <reference lib="dom" />
/** @jsx h */

import { h } from "./deps/preact.tsx";

export const CSS = () => (
  <style>
    {`.container {
  position: absolute;
  margin-top: 14px;
  max-height: 80vh;
  z-index: 301;

  background-color: var(--select-suggest-bg, #111);
  font-family: var(--select-suggest-font-family, "Open Sans", Helvetica, Arial, "Hiragino Sans", sans-serif);
  font-size: 14px;
  color: var(--select-suggest-text-color, #eee);
  border-radius: 4px;
}
.candidates {
  max-width: 80vw;
}
.candidates:not([data-os*="android"]):not([data-os*="ios"]) {
  font-size:11px;

}
.projects {
  margin-right: 4px;
  display: grid;
  grid-template-rows: repeat(4, min-content);
  grid-auto-flow: column;
  direction: rtl;
}
.projects:is([data-os*="android"], [data-os*="ios"]) > * {
  padding: 6px;
}

.candidates > :not(:first-child) {
  border-top: 1px solid var(--select-suggest-border-color, #eee);
}
.candidates > *{
  line-height: 1.2em;
  padding: 0.5em 10px;
}

.candidate {
  display: flex;
}

a {
  display: block;
  text-decoration: none;
  color: inherit;
}
a:not(.mark) {
  width: 100%;
}
.selected a {
  background-color: var(--select-suggest-selected-bg, #222);
  text-decoration: underline
}
img {
  height: 1.3em;
  width: 1.3em;
  position: relative;
  object-fit: cover;
  object-position: 0% 0%;
}
.disabled {
  filter: grayscale(1.0) opacity(0.5);
}
.counter {
  color: var(--select-suggest-information-text-color, #aaa);
  font-size: 80%;
  font-style: italic;
}
.progress[style] {
  padding: unset;
  border: unset;
  height: 0.5px;
  transition: background 0.1s;
}`}
  </style>
);
