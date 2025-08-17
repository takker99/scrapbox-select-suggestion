export * from "jsr:@takker/cosense-storage@0.3";

import { deleteDB } from "npm:idb@8";

// deno-lint-ignore no-explicit-any
if (!(globalThis as any).Deno) {
  // 旧ver.で使っていたDBを削除する
  deleteDB("userscript-links").catch((e) => console.error(e));
}
