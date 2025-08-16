import { type Action, reducer, type State } from "./reducer.ts";
import type { Line, Position, Range } from "./deps/scrapbox.ts";
import { assertEquals, assertStrictEquals } from "./deps/testing.ts";
import lines from "./sample-lines1.json" with { type: "json" };

const inputCompl = (
  query: string,
  start: number,
  line: number,
  char: number,
): State => ({
  type: "completion",
  context: "input",
  query,
  start,
  position: { line, char },
});
const selectCompl = (
  query: string,
  start: number,
  line: number,
  char: number,
): State => ({
  type: "completion",
  context: "selection",
  query,
  start,
  position: { line, char },
});

const ready: State = { type: "ready" };
const inputCancel: State = { type: "cancelled", context: "input" };
const selectCancel: State = { type: "cancelled", context: "selection" };
const disabledAuto: State = { type: "disabled" };
const disabled: State = { type: "disabled", isManuallyDisabled: true };

const enable: Action = { type: "enable" };
const disable: Action = { type: "disable" };
const lock: Action = { type: "lock" };
const unlock: Action = { type: "unlock" };
const cancel: Action = { type: "cancel" };
const inputEvent = (
  position: Position,
  range: Range,
): Action => ({
  type: "lines:changed",
  lines: (lines as Line[]),
  position,
  range,
});
const selectEvent = (
  position: Position,
  range: Range,
): Action => ({
  type: "selection:changed",
  lines: (lines as Line[]),
  position,
  range,
});
const cursorEvent = (
  position: Position,
  range: Range,
): Action => ({
  type: "cursor:changed",
  lines: (lines as Line[]),
  position,
  range,
});

const emptyRange: Range = {
  start: { line: 0, char: 0 },
  end: { line: 0, char: 0 },
};

Deno.test("reducer()", async (t) => {
  {
    const states = [
      ready,
      disabled,
      disabledAuto,
      inputCompl("[code2svg]", 29, 6, 30),
      selectCompl("[code2svg]", 29, 6, 30),
      inputCancel,
      selectCancel,
    ];
    await t.step(
      "X + disable → disabled",
      () => {
        for (const state of states) {
          assertEquals(reducer(state, disable), disabled);
        }
        assertStrictEquals(reducer(disabled, disable), disabled);
      },
    );

    await t.step("lock and unlock", () => {
      for (const state of states) {
        const lockedState: State = { lock: true, ...state };
        assertEquals(reducer(state, lock), lockedState);
        assertEquals(reducer(lockedState, unlock), state);
        assertStrictEquals(reducer(lockedState, lock), lockedState);
        assertStrictEquals(reducer(state, unlock), state);
      }
    });
  }

  await t.step(
    "X + enable →",
    () => {
      for (
        const state of [
          ready,
          inputCompl("[code2svg]", 29, 6, 30),
          selectCompl("[code2svg]", 29, 6, 30),
          inputCancel,
          selectCancel,
        ]
      ) {
        assertStrictEquals(reducer(state, enable), state);
      }
      assertEquals(reducer(disabled, enable), ready);
      // 物理的に入力補完できる状態でないときは、有効化を指示しても補完待機状態にできない
      assertEquals(reducer(disabledAuto, enable), disabledAuto);
      assertStrictEquals(reducer(disabledAuto, enable), disabledAuto);
    },
  );

  await t.step(
    "X + cancel →",
    () => {
      for (
        const state of [
          ready,
          disabled,
          disabledAuto,
          inputCancel,
          selectCancel,
        ]
      ) {
        assertStrictEquals(reducer(state, cancel), state);
      }
      assertEquals(
        reducer(inputCompl("[code2svg]", 29, 6, 30), cancel),
        inputCancel,
      );
      assertEquals(
        reducer(selectCompl("[code2svg]", 29, 6, 30), cancel),
        selectCancel,
      );
    },
  );

  await t.step("X + input →", async (t) => {
    await t.step(
      "リンク内にカーソルがある状態で文字入力すると補完に移行する",
      () => {
        const query = "[code2svg]";
        for (let char = 30; char < 29 + [...query].length; char++) {
          for (
            const state of [
              ready,
              inputCompl(query, 29, 6, char),
              selectCompl(query, 29, 6, char),
              selectCancel,
            ]
          ) {
            assertEquals(
              reducer(
                state,
                inputEvent({ line: 6, char }, emptyRange),
              ),
              inputCompl(query, 29, 6, char),
            );
          }
        }
      },
    );

    await t.step(
      "カーソルがリンク内になければ、文字入力しても補完を開始しない",
      () => {
        for (
          const char of [
            ...Array(30).keys(),
            ...[...Array(48).keys()].slice(30 + 9),
          ]
        ) {
          for (
            const state of [
              ready,
              inputCompl("code2svg", 29, 6, char),
              selectCompl("code2svg", 29, 6, char),
              selectCancel,
            ]
          ) {
            assertEquals(
              reducer(
                state,
                inputEvent({ line: 6, char }, emptyRange),
              ),
              ready,
            );
          }
        }
      },
    );
  });

  await t.step("X + cursor →", async (t) => {
    await t.step(
      "リンク内に侵入しても、補完を起動しない",
      () => {
        assertEquals(
          reducer(
            ready,
            cursorEvent({ line: 6, char: 30 }, emptyRange),
          ),
          ready,
        );
      },
    );

    await t.step(
      "カーソルをリンク内で動かす分には、入力補完を継続する",
      () => {
        assertEquals(
          reducer(
            inputCompl("[code2svg]", 29, 6, 30),
            cursorEvent({ line: 6, char: 31 }, emptyRange),
          ),
          inputCompl("[code2svg]", 29, 6, 31),
        );
      },
    );

    await t.step(
      "カーソルがリンクの外に出たら、補完を終了する",
      () => {
        assertEquals(
          reducer(
            inputCompl("[code2svg]", 29, 6, 30),
            cursorEvent({ line: 6, char: 29 }, emptyRange),
          ),
          ready,
        );
      },
    );
  });

  await t.step(
    "disabled (auto) + X →",
    async (t) => {
      await t.step("linesの有無で有効と無効を切り替える", () => {
        for (
          const type of [
            "lines:changed",
            "selection:changed",
            "cursor:changed",
          ] as const
        ) {
          assertEquals(
            reducer(disabledAuto, {
              type,
              lines: (lines as Line[]),
              position: { line: 6, char: 30 },
              range: emptyRange,
            }),
            ready,
          );
          assertStrictEquals(
            reducer(disabledAuto, {
              type,
              position: { line: 6, char: 30 },
              range: emptyRange,
            }),
            disabledAuto,
          );
        }
      });
    },
  );

  await t.step("selection", async (t) => {
    await t.step(
      "1行選択されているときは、選択範囲補完を開始する",
      () => {
        const position = { line: 6, char: 14 };
        const start = { line: 6, char: 4 };
        const end = { line: 6, char: 25 };
        const next = selectCompl(
          "ジでコードに言及している箇所がある場合は、",
          4,
          position.line,
          position.char,
        );
        for (
          const state of [
            ready,
            inputCompl("code2svg", 29, 6, 30),
            selectCompl("code2svg", 29, 6, 30),
          ]
        ) {
          for (
            const type of [
              "lines:changed",
              "selection:changed",
              "cursor:changed",
            ] as const
          ) {
            assertEquals(
              reducer(state, {
                type,
                lines: (lines as Line[]),
                position,
                range: { start, end },
              }),
              next,
            );
            assertEquals(
              reducer(state, {
                type,
                lines: (lines as Line[]),
                position,
                range: { start: end, end: start },
              }),
              next,
            );
          }
        }
      },
    );

    await t.step(
      "複数行選択されているときは何もしない",
      () => {
        const position = { line: 6, char: 14 };
        const start = { line: 6, char: 4 };
        const end = { line: 7, char: 25 };
        for (
          const state of [
            ready,
            inputCompl("code2svg", 29, 6, 30),
            selectCompl("code2svg", 29, 6, 30),
          ]
        ) {
          for (
            const type of [
              "lines:changed",
              "selection:changed",
              "cursor:changed",
            ] as const
          ) {
            assertEquals(
              reducer(state, {
                type,
                lines: (lines as Line[]),
                position,
                range: { start, end },
              }),
              ready,
            );
            assertEquals(
              reducer(state, {
                type,
                lines: (lines as Line[]),
                position,
                range: { start: end, end: start },
              }),
              ready,
            );
          }
        }
      },
    );

    await t.step(
      "コードブロック中では何もしない",
      () => {
        for (const line of [57, 58]) {
          const position = { line, char: 1 };
          const start = { line, char: 1 };
          const end = { line, char: 3 };
          const range = { start, end };
          for (
            const state of [
              ready,
              inputCompl("[code2svg]", 29, line, 1),
              selectCompl("code2svg", 29, line, 1),
            ]
          ) {
            for (
              const type of [
                "lines:changed",
                "selection:changed",
                "cursor:changed",
              ] as const
            ) {
              assertEquals(
                reducer(state, {
                  type,
                  lines: (lines as Line[]),
                  position,
                  range,
                }),
                ready,
              );
            }
          }
        }
      },
    );
  });

  await t.step("input completion + X →", () => {
    const completion = inputCompl("[code2svg]", 29, 6, 30);
    assertEquals(reducer(completion, cancel), inputCancel);
  });

  await t.step("input cancelled + X →", async (t) => {
    await t.step("リンク内にいるときはcancelしたまま", () => {
      assertEquals(
        reducer(inputCancel, inputEvent({ line: 6, char: 31 }, emptyRange)),
        inputCancel,
      );
      assertEquals(
        reducer(inputCancel, cursorEvent({ line: 6, char: 31 }, emptyRange)),
        inputCancel,
      );
      assertEquals(
        reducer(
          inputCancel,
          selectEvent({ line: 6, char: 31 }, {
            start: { line: 6, char: 31 },
            end: { line: 6, char: 45 },
          }),
        ),
        inputCancel,
      );
    });

    await t.step("リンクから抜けたらcancel状態を解除する", () => {
      assertEquals(
        reducer(inputCancel, inputEvent({ line: 6, char: 0 }, emptyRange)),
        ready,
      );
      assertEquals(
        reducer(inputCancel, cursorEvent({ line: 6, char: 0 }, emptyRange)),
        ready,
      );
      assertEquals(
        reducer(
          inputCancel,
          selectEvent({ line: 6, char: 0 }, {
            start: { line: 6, char: 0 },
            end: { line: 6, char: 45 },
          }),
        ),
        inputCancel,
      );
    });
  });

  await t.step("selection cancelled + X →", async (t) => {
    await t.step("選択範囲があるときはcancelしたまま", () => {
      const position = { line: 6, char: 14 };
      for (
        const type of [
          "lines:changed",
          "selection:changed",
          "cursor:changed",
        ] as const
      ) {
        assertEquals(
          reducer(selectCancel, {
            type,
            lines: (lines as Line[]),
            position,
            range: {
              start: { line: 6, char: 4 },
              end: { line: 6, char: 25 },
            },
          }),
          selectCancel,
        );
        assertEquals(
          reducer(selectCancel, {
            type,
            lines: (lines as Line[]),
            position,
            range: {
              start: { line: 6, char: 4 },
              end: { line: 7, char: 25 },
            },
          }),
          selectCancel,
        );
      }
    });

    await t.step("選択範囲が消えたらcancelを解除する", () => {
      for (
        const type of [
          "lines:changed",
          "selection:changed",
          "cursor:changed",
        ] as const
      ) {
        assertEquals(
          reducer(selectCancel, {
            type,
            lines: (lines as Line[]),
            position: { line: 6, char: 14 },
            range: emptyRange,
          }),
          ready,
        );
      }
    });
  });
});
