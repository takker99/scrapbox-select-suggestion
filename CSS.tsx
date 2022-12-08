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
color: var(--select-suggest-text-color, #eee);
border-radius: 4px;
}
.candidates {
max-width: 80vw;
}
.projects {
max-width: 10vw;
margin-right: 4px;
display: grid;
grid-template-rows: repeat(4, 1fr);
grid-auto-flow: column;
     direction: rtl;
}
.container.candidates > :not(:first-child) {
  border-top: 1px solid var(--select-suggest-border-color, #eee);
}
.container.candidates > *{
  font-size: 11px;
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
}`}
  </style>
);
