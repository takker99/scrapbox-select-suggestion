import { crawlLink } from "./crawlLink.ts";
import type { Line } from "./deps/scrapbox.ts";
import { assertEquals } from "./deps/testing.ts";
import line from "./sample-line1.json" with { type: "json" };
import line2 from "./sample-line2.json" with { type: "json" };
import lines from "./sample-lines1.json" with { type: "json" };
import lines2 from "./sample-lines2.json" with { type: "json" };

Deno.test("crawlLink()", async (t) => {
  {
    await t.step(line.text, () => {
      assertEquals([...crawlLink(line)], [
        { start: 0, whole: "[選択範囲]" },
        { start: 14, whole: "[リンク]" },
        { start: 24, whole: "[リンクの入力補完]" },
      ]);
    });
  }
  {
    await t.step(line2.text, () => {
      assertEquals([...crawlLink(line2)], [
        { start: 6, whole: "[リンク]" },
        { start: 23, whole: "[リンク]" },
        { start: 34, whole: "[リンク]" },
        { start: 53, whole: "[リンク]" },
        { start: 71, whole: "[リンク]" },
        { start: 93, whole: "[テスト]" },
      ]);
    });
  }
  {
    await t.step(lines[0].text, () => {
      assertEquals([...crawlLink(lines[0] as Line)], []);
    });
    await t.step(lines[1].text, () => {
      assertEquals([...crawlLink(lines[1] as Line)], [
        { start: 0, whole: "[scrapbox]" },
        { start: 12, whole: "[apkg]" },
      ]);
    });
    await t.step(lines[2].text, () => {
      assertEquals([...crawlLink(lines[2] as Line)], []);
    });
    await t.step(lines[3].text, () => {
      assertEquals([...crawlLink(lines[3] as Line)], [
        {
          start: 0,
          whole: "[Scrapboxを使ったAnkiデータ構築案：穴埋め特化ver]",
        },
        {
          start: 35,
          whole: "[Scrapboxを使ったAnkiデータ構築案1]",
        },
      ]);
    });
    await t.step(lines[4].text, () => {
      assertEquals([...crawlLink(lines[4] as Line)], []);
    });
    await t.step(lines[5].text, () => {
      assertEquals([...crawlLink(lines[5] as Line)], [
        {
          start: 2,
          whole: "[scrapboxでコードの差分を管理するのは非常に難しい]",
        },
      ]);
    });
    await t.step(lines[6].text, () => {
      assertEquals([...crawlLink(lines[6] as Line)], [
        { start: 29, whole: "[code2svg]" },
      ]);
    });
  }
  {
    await t.step(lines2[90].text, () => {
      assertEquals([...crawlLink(lines2[90] as Line)], [
        { start: 3, whole: "[リンク]" },
      ]);
    });
    await t.step(lines2[98].text, () => {
      assertEquals([...crawlLink(lines2[98] as Line)], [
        { start: 6, whole: "[リンク]" },
      ]);
    });
    await t.step(lines2[116].text, () => {
      assertEquals([...crawlLink(lines2[116] as Line)], [
        { start: 5, whole: "[ネタバレ防止記法]" },
      ]);
    });
  }
});
