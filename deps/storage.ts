export * from "jsr:@takker/cosense-storage@0.3";

import { deleteDB } from "npm:idb@8";

// 旧ver.で使っていたDBを削除する
deleteDB("userscript-links").catch((e) => console.error(e));
