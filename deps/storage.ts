export * from "https://raw.githubusercontent.com/takker99/scrapbox-storage/0.1.2/mod.ts";

import { deleteDB } from "https://raw.githubusercontent.com/takker99/scrapbox-storage/0.1.2/deps/idb.ts";
// 旧ver.で使っていたDBを削除する
deleteDB("userscript-links").catch((e) => console.error(e));
