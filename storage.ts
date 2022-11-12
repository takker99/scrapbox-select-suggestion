/// <reference no-default-lib="true" />
/// <reference lib="esnext" />
/// <reference lib="dom" />

import { DBSchema, IDBPDatabase, openDB } from "./deps/idb.ts";
import {
  getProject,
  listProjects,
  readLinksBulk,
  Result,
  toTitleLc,
} from "./deps/scrapbox-rest.ts";
import {
  NotFoundError,
  NotLoggedInError,
  NotMemberError,
  Project,
} from "./deps/scrapbox.ts";
import { logger } from "./debug.ts";

/** リンクデータ
 *
 * property nameを省略することでデータ量を減らしている
 */
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

/** 更新を確認し、更新があればDBに反映する
 *
 * @param projects 更新を確認したい補完ソースのproject names
 * @param updateInterval 最後に更新を確認してからどのくらい経過したデータを更新すべきか (単位は秒)
 */
export const checkUpdate = async (
  projects: readonly string[],
  updateInterval: number,
): Promise<Source[]> => {
  const db = await open();
  const tag = "[scrapbox-select-suggestion]";

  // 更新する必要のあるデータを探し、フラグを立てる
  logger.debug("check updates of links...");

  const projectsMaybeNeededUpgrade: ProjectStatus[] = [];
  const projectStatus: SourceStatus[] = [];
  try {
    {
      const tx = db.transaction("status", "readwrite");
      await Promise.all(projects.map(async (project) => {
        const status = await tx.store.get(project);

        if (status?.isValid === false) return;

        const checked = status?.checked ?? 0;
        const now = new Date().getTime() / 1000;
        // 更新されたばかりのデータは飛ばす
        if (checked + updateInterval > now) return;
        // 更新中にタブが強制終了した可能性を考慮して、更新中フラグが経った時刻より10分経過していたらデータ更新対称に含める
        if (status?.updating && checked + 600 > now) return;

        const tempStatus: ProjectStatus = {
          project,
          id: status?.id,
          isValid: true,
          checked,
          updated: status?.updated ?? 0,
          updating: true,
        };

        projectsMaybeNeededUpgrade.push(tempStatus);
        tx.store.put(tempStatus);
      }));
      await tx.done;
    }
    logger.debug(
      `checked. ${projectsMaybeNeededUpgrade.length} projects maybe need upgrade.`,
    );

    // 更新するprojectsがなければ何もしない
    if (projectsMaybeNeededUpgrade.length === 0) return [];

    const bc = new BroadcastChannel(notifyChannelName);
    const result: Source[] = [];
    // 一つづつ更新する
    for await (const res of fetchProjectStatus(projectsMaybeNeededUpgrade)) {
      // project dataを取得できないときは、無効なprojectに分類しておく
      if (!res.ok) {
        projectStatus.push({ project: res.value.project, isValid: false });
        switch (res.value.name) {
          case "NotFoundError":
            console.warn(`${tag} "${res.value.project}" is not found.`);
            continue;
          case "NotMemberError":
            console.warn(
              `${tag} You are not a member of "${res.value.project}".`,
            );
            continue;
          case "NotLoggedInError":
            console.warn(
              `${tag} You are not a member of "${res.value.project}" or You are not logged in yet.`,
            );
            continue;
        }
      }

      // projectの最終更新日時から、updateの要不要を調べる
      if (res.value.updated < res.value.checked) {
        logger.debug(`no updates in "${res.value.name}"`);
      } else {
        // リンクデータを更新する
        const data: Source = {
          project: res.value.name,
          links: await downloadLinks(res.value.name),
        };
        result.push(data);

        logger.time(`write data of "${res.value.name}"`);
        await write(data);
        // 更新通知を出す
        bc.postMessage({ type: "update", project: res.value.name } as Notify);
        logger.timeEnd(`write data of "${res.value.name}"`);
      }

      projectStatus.push({
        project: res.value.name,
        isValid: true,
        id: res.value.id,
        checked: new Date().getTime() / 1000,
        updated: res.value.updated,
        updating: false,
      });
    }
    bc.close();
    return result;
  } finally {
    // エラーが起きた場合も含め、フラグをもとに戻しておく

    const tx = db.transaction("status", "readwrite");
    const store = tx.store;
    await Promise.all(
      projectStatus.map((status) => store.put(status)),
    );
    await tx.done;
  }
};

async function* fetchProjectStatus(
  projects: ProjectStatus[],
): AsyncGenerator<
  Result<
    Project & { checked: number },
    (NotLoggedInError | NotFoundError | NotMemberError) & { project: string }
  >,
  void,
  unknown
> {
  // idがあるものとないものとに分ける
  const projectIds: string[] = [];
  let newProjects: string[] = [];
  const checkedMap = new Map<string, number>();
  for (const project of projects) {
    if (project.id) {
      projectIds.push(project.id);
    } else {
      newProjects.push(project.project);
    }
    checkedMap.set(project.project, project.checked);
  }
  const result = await listProjects(projectIds);
  if (!result.ok) {
    // log inしていないときは、getProject()で全てのprojectのデータを取得する
    newProjects = projects.map((project) => project.project);
  } else {
    for (const project of result.value.projects) {
      if (!checkedMap.has(project.name)) continue;
      yield {
        ok: true,
        value: { ...project, checked: checkedMap.get(project.name) ?? 0 },
      };
    }
  }
  for (const name of newProjects) {
    const res = await getProject(name);
    yield res.ok
      ? {
        ok: true,
        value: { ...res.value, checked: checkedMap.get(name) ?? 0 },
      }
      : { ok: false, value: { ...res.value, project: name } };
  }
}

/** 補完ソースをDBから取得する
 *
 * @param projects 取得したい補完ソースのproject nameのリスト
 * @return 補完ソースのリスト projectsと同じ順番で並んでいる
 */
export const load = async (
  projects: readonly string[],
): Promise<Source[]> => {
  const list: Source[] = [];

  const tag = `read links of ${projects.length} projects`;
  logger.time(tag);
  {
    const tx = (await open()).transaction("source", "readonly");
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
  logger.timeEnd(tag);

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
const open = async (): Promise<IDBPDatabase<LinkDB>> => {
  if (db) return db;

  db = await openDB<LinkDB>("userscript-links", 5, {
    upgrade(db) {
      logger.time("update DB");

      for (const name of db.objectStoreNames) {
        db.deleteObjectStore(name);
      }

      db.createObjectStore("source", { keyPath: "project" });
      db.createObjectStore("status", { keyPath: "project" });

      logger.timeEnd("update DB");
    },
  });

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

type SourceStatus = ProjectStatus | InvalidProjectStatus;

interface ProjectStatus {
  /** project name (key) */
  project: string;

  /** project id
   *
   * projectsの更新日時を一括取得するときに使う
   */
  id?: string;

  /** 有効なprojectかどうか
   *
   * アクセス権のないprojectと存在しないprojectの場合はfalseになる
   */
  isValid: true;

  /** projectの最終更新日時
   *
   * リンクデータの更新を確認するときに使う
   */
  updated: number;

  /** データの最終確認日時 */
  checked: number;

  /** 更新中フラグ */
  updating: boolean;
}

interface InvalidProjectStatus {
  /** project name (key) */
  project: string;

  /** 有効なprojectかどうか
   *
   * アクセス権のないprojectと存在しないprojectの場合はfalseになる
   */
  isValid: false;
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
): Promise<CompressedSource[]> => {
  const reader = await readLinksBulk(project);
  if ("name" in reader) {
    console.error(reader);
    throw new Error(`${reader.name}: ${reader.message}`);
  }

  const tag = `download and create Links of "${project}"`;
  logger.time(tag);
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

  for await (const pages of reader) {
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
  }
  logger.timeEnd(tag);

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
