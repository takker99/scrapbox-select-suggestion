import { Line, Node } from "./deps/scrapbox.ts";

export interface Link {
  whole: string;
  start: number;
}

/** 指定した行に含まれるすべてのリンクを位置付きで返す
 *
 * @param line 調べる行
 * @return 行中のリンクを順次返す
 */
export function* crawlLink(line: Line): Generator<Link, void, unknown> {
  if (!("nodes" in line)) return;

  /** 現在読み込んでいるnodeの語頭の要素番号 */
  let char = 0;

  function* crawl(nodes: Node[] | Node): Generator<Link, void, unknown> {
    for (
      const node of Array.isArray(nodes) ? nodes : [nodes]
    ) {
      if (typeof node === "string") {
        char += [...node].length;
        continue;
      }

      switch (node.type) {
        case "link":
          yield { whole: node.unit.whole, start: char };
          char += [...node.unit.whole].length;
          break;
        case "indent":
          char += [...node.unit.tag].length;
          yield* crawl(node.children);
          break;
        case "quote":
        case "deco":
        case "strong":
          yield* crawl(node.children);
          break;
        default:
          char += [...node.unit.whole].length;
          break;
      }
    }
  }

  yield* crawl(line.nodes);
}
