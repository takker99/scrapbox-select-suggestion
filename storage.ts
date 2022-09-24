/// <reference no-default-lib="true" />
/// <reference lib="esnext" />
/// <reference lib="dom" />

import { DBSchema, IDBPDatabase, openDB } from "./deps/idb.ts";
import { readLinksBulk, toTitleLc } from "./deps/scrapbox-rest.ts";

export type CompressedSource = [
  string, // ページタイトル
  string, // titleLc形式のページタイトル
  boolean, // 画像があるページかどうか
  number, // ページ中のリンク数
  number, // 被リンク数
  number, // updated
];

export interface Source {
  /** project name (key) */
  project: string;

  /** リンクデータ */
  links: CompressedSource[];
}

export interface Options {
  debug?: boolean;
}

/** 更新を確認し、更新があればDBに反映する
 *
 * @param projects 更新を確認したい補完ソースのproject names
 * @param updateInterval 最後に更新を確認してからどのくらい経過したデータを更新すべきか (単位は秒)
 */
export const checkUpdate = async (
  projects: readonly string[],
  updateInterval: number,
  options?: Options,
): Promise<Source[]> => {
  const db = await open(options);

  // 更新する必要のあるデータを探し、フラグを立てる
  if (options?.debug) console.debug("check updates of links...");

  const projectsNeededUpgrade: string[] = [];
  try {
    {
      const tx = db.transaction("status", "readwrite");
      await Promise.all(projects.map(async (project) => {
        const status = await tx.store.get(project);

        // 誰かが更新しているデータ、更新されたばかりのデータは飛ばす
        if (status?.updating) return;
        if (
          status?.checked ?? 0 + updateInterval > new Date().getTime() / 1000
        ) {
          return;
        }

        projectsNeededUpgrade.push(project);
        tx.store.put({
          project,
          checked: status?.checked ?? 0,
          updating: true,
        });
      }));
      await tx.done;
    }
    if (options?.debug) {
      console.debug(
        `checked. ${projectsNeededUpgrade.length} projects need upgrade.`,
        projectsNeededUpgrade,
      );
    }

    const bc = new BroadcastChannel(notifyChannelName);
    const result: Source[] = [];
    // 一つづつ更新する
    for (const project of projectsNeededUpgrade) {
      const data: Source = {
        project,
        links: await downloadLinks(project, options),
      };
      result.push(data);

      if (options?.debug) console.time(`write data of "${project}"`);
      await write(data);
      // 更新通知を出す
      bc.postMessage({ type: "update", project } as Notify);

      if (options?.debug) console.timeEnd(`write data of "${project}"`);
    }
    bc.close();
    return result;
  } finally {
    // エラーが起きた場合も含め、フラグをもとに戻しておく

    const tx = db.transaction("status", "readwrite");
    const store = tx.store;
    await Promise.all(
      projectsNeededUpgrade.map((project) =>
        store.put({
          project,
          checked: new Date().getTime() / 1000,
          updating: false,
        })
      ),
    );
    await tx.done;
  }
};

/** 補完ソースをDBから取得する
 *
 * @param projects 取得したい補完ソースのproject nameのリスト
 * @return 補完ソースのリスト projectsと同じ順番で並んでいる
 */
export const load = async (
  projects: readonly string[],
  options?: Options,
): Promise<Source[]> => {
  const list: Source[] = [];

  const tag = `read links of ${projects.length} projects`;
  if (options?.debug) console.time(tag);
  {
    const tx = (await open(options)).transaction("source", "readonly");
    await Promise.all(projects.map(async (project) => {
      const source = await tx.store.get(project);
      if (!source) {
        list.push({ project, links: [] });
      } else {
        list.push(source);
      }
    }));
    await tx.done;
  }
  if (options?.debug) console.timeEnd(tag);

  return list;
};

/** 補完ソースの更新を取得する
 *
 * @param projects ここに指定されたprojectの更新のみを受け取る
 * @param listener 更新を受け取るlistener
 * @returm listener解除などをする後始末函数
 */
export const listenUpdate = (
  projects: readonly string[],
  listener: (notify: Notify) => void,
): () => void => {
  const bc = new BroadcastChannel(notifyChannelName);
  const callback = (e: MessageEvent<Notify>) => {
    if (!projects.includes(e.data.project)) return;
    listener(e.data);
  };
  bc.addEventListener("message", callback);
  return () => {
    bc.removeEventListener("message", callback);
    bc.close();
  };
};

let db: IDBPDatabase<LinkDB>;
/** 外部には公開せず、module内部で一度だけ呼び出す */
const open = async (options?: Options): Promise<IDBPDatabase<LinkDB>> => {
  if (db) return db;

  if (options?.debug) console.time("create DB");
  db = await openDB<LinkDB>("userscript-links", 4, {
    upgrade(db) {
      for (const name of db.objectStoreNames) {
        db.deleteObjectStore(name);
      }

      db.createObjectStore("source", { keyPath: "project" });
      db.createObjectStore("status", { keyPath: "project" });
    },
  });
  if (options?.debug) console.timeEnd("create DB");

  return db;
};

interface LinkDB extends DBSchema {
  /** 補完ソースを格納するstore */
  source: {
    value: Source;
    key: string;
  };

  /** 補完ソースの更新状況を格納するstore */
  status: {
    value: SourceStatus;
    key: string;
  };
}

interface SourceStatus {
  /** project name (key) */
  project: string;

  /** データの最終確認日時 */
  checked: number;

  /** 更新中フラグ */
  updating: boolean;
}

/** DBの補完ソースを更新する */
const write = async (data: Source) => (await open()).put("source", data);

/** 更新通知用broadcast channelの名前 */
const notifyChannelName = "userscript-store-notify";
/** broadcast channelで流すデータ */
type Notify = {
  type: "update";
  project: string;
};

const downloadLinks = async (
  project: string,
  options?: Options,
): Promise<CompressedSource[]> => {
  const reader = await readLinksBulk(project);
  if ("name" in reader) {
    console.error(reader);
    throw new Error(`${reader.name}: ${reader.message}`);
  }

  const tag = `download and create Links of "${project}"`;
  if (options?.debug) console.time(tag);
  const linkMap = new Map<
    string,
    {
      title: string;
      hasIcon: boolean;
      links: number;
      linked: number;
      updated: number;
    }
  >();

  let counter = 0;
  for await (const pages of reader) {
    const tag = `[${project}][${counter}-${
      counter + pages.length
    }]create links `;
    if (options?.debug) console.time(tag);
    for (const page of pages) {
      const titleLc = toTitleLc(page.title);
      const link = linkMap.get(titleLc);
      linkMap.set(titleLc, {
        title: page.title,
        hasIcon: page.hasIcon,
        updated: page.updated,
        links: page.links.length,
        linked: link?.linked ?? 0,
      });

      for (const link of page.links) {
        const linkLc = toTitleLc(link);

        const data = linkMap.get(linkLc);
        linkMap.set(linkLc, {
          title: data?.title ?? link,
          hasIcon: data?.hasIcon ?? false,
          updated: data?.updated ?? 0,
          links: data?.links ?? 0,
          linked: (data?.linked ?? 0) + 1,
        });
      }
    }
    if (options?.debug) console.timeEnd(tag);
    counter += pages.length;
  }
  if (options?.debug) console.timeEnd(tag);

  return [...linkMap.entries()].map((
    [titleLc, data],
  ) => [
    data.title,
    titleLc,
    data.hasIcon,
    data.links,
    data.linked,
    data.updated,
  ]);
};
