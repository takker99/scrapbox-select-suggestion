import { toTitleLc } from "./deps/scrapbox-title.ts";
import type { Diff, Link } from "./deps/storage.ts";

export interface Candidate {
  title: string;
  titleLc: string;
  updated: number;
  linked: number;
  metadata: Map<string, { image?: string }>;
}

/**
 * Linkのコレクションから候補のMapを作成する
 * @param links リンクのIterable
 * @returns 候補のMap（キーは小文字化されたタイトル）
 *
 * @example 空のリンクから空のMapを作成
 * ```ts
 * import { assertEquals } from "./deps/testing.ts";
 *
 * const result = makeCandidate([]);
 * assertEquals(result.size, 0);
 * ```
 *
 * @example 単一のリンクから候補を作成
 * ```ts
 * import { assertEquals } from "./deps/testing.ts";
 * import type { Link } from "./deps/storage.ts";
 *
 * const link: Link = {
 *   id: "test-page-id",
 *   title: "TestPage",
 *   project: "testproject",
 *   updated: 1234567890,
 *   links: ["LinkedPage1", "LinkedPage2"],
 *   image: "test.jpg",
 * };
 *
 * const result = makeCandidate([link]);
 *
 * // メインページの候補が作成される
 * const mainCandidate = result.get("testpage");
 * assertEquals(mainCandidate?.title, "TestPage");
 * assertEquals(mainCandidate?.titleLc, "testpage");
 * assertEquals(mainCandidate?.updated, 1234567890);
 * assertEquals(mainCandidate?.linked, 0);
 * assertEquals(
 *   mainCandidate?.metadata.get("testproject")?.image,
 *   "test.jpg",
 * );
 *
 * // リンクされたページの候補も作成される
 * const linkedCandidate1 = result.get("linkedpage1");
 * assertEquals(linkedCandidate1?.title, "LinkedPage1");
 * assertEquals(linkedCandidate1?.linked, 1);
 *
 * const linkedCandidate2 = result.get("linkedpage2");
 * assertEquals(linkedCandidate2?.title, "LinkedPage2");
 * assertEquals(linkedCandidate2?.linked, 1);
 * ```
 *
 * @example 複数のリンクから候補を作成
 * ```ts
 * import { assertEquals } from "./deps/testing.ts";
 * import type { Link } from "./deps/storage.ts";
 *
 * const links: Link[] = [
 *   {
 *     id: "page1-id",
 *     title: "Page1",
 *     project: "project1",
 *     updated: 1000,
 *     links: ["SharedPage"],
 *     image: "img1.jpg",
 *   },
 *   {
 *     id: "page2-id",
 *     title: "Page2",
 *     project: "project2",
 *     updated: 2000,
 *     links: ["SharedPage"],
 *     image: "img2.jpg",
 *   },
 * ];
 *
 * const result = makeCandidate(links);
 *
 * // SharedPageは両方からリンクされているので、linked = 2
 * const sharedCandidate = result.get("sharedpage");
 * assertEquals(sharedCandidate?.linked, 2);
 * assertEquals(sharedCandidate?.metadata.size, 2);
 * assertEquals(
 *   sharedCandidate?.metadata.get("project1")?.image,
 *   "img1.jpg",
 * );
 * assertEquals(
 *   sharedCandidate?.metadata.get("project2")?.image,
 *   "img2.jpg",
 * );
 * ```
 */
export const makeCandidate = (
  links: Iterable<Link>,
): Map<string, Candidate> => {
  const result = new Map<string, Candidate>();
  for (const link of links) {
    addLink(result, link);
  }
  return result;
};

/**
 * 既存の候補MapにDiffを適用して新しいMapを返す
 *
 * @internal
 *
 * @param candidates 既存の候補Map
 * @param diff 適用するDiff
 * @returns 更新された候補Map
 *
 * @example 追加のDiffを適用
 * ```ts
 * import { assertEquals } from "./deps/testing.ts";
 * import type { Candidate } from "./source.ts";
 * import type { Diff, Link } from "./deps/storage.ts";
 *
 * const candidates = new Map<string, Candidate>();
 * const addedLink: Link = {
 *   id: "new-page-id",
 *   title: "NewPage",
 *   project: "project1",
 *   updated: 1000,
 *   links: [],
 *   image: "new.jpg",
 * };
 *
 * const diff: Diff = {
 *   added: new Map([["key1", addedLink]]),
 * };
 *
 * const result = applyDiff(candidates, diff);
 * assertEquals(result.size, 1);
 * assertEquals(result.get("newpage")?.title, "NewPage");
 * ```
 *
 * @example 更新のDiffを適用
 * ```ts
 * import { assertEquals } from "./deps/testing.ts";
 * import type { Candidate } from "./source.ts";
 * import type { Diff, Link } from "./deps/storage.ts";
 *
 * const candidates = new Map<string, Candidate>();
 * const initialLink: Link = {
 *   id: "test-page-id",
 *   title: "TestPage",
 *   project: "project1",
 *   updated: 1000,
 *   links: [],
 *   image: "old.jpg",
 * };
 *
 * addLink(candidates, initialLink);
 *
 * const beforeLink: Link = {
 *   id: "test-page-id",
 *   title: "TestPage",
 *   project: "project1",
 *   updated: 1000,
 *   links: [],
 *   image: "old.jpg",
 * };
 * const afterLink: Link = {
 *   id: "test-page-id",
 *   title: "TestPage",
 *   project: "project1",
 *   updated: 2000,
 *   links: [],
 *   image: "new.jpg",
 * };
 *
 * const diff: Diff = {
 *   updated: new Map([["key1", [beforeLink, afterLink]]]),
 * };
 *
 * const result = applyDiff(candidates, diff);
 * assertEquals(result.get("testpage")?.updated, 2000);
 * assertEquals(
 *   result.get("testpage")?.metadata.get("project1")?.image,
 *   "new.jpg",
 * );
 * ```
 *
 * @example 削除のDiffを適用
 * ```ts
 * import { assertEquals } from "./deps/testing.ts";
 * import type { Candidate } from "./source.ts";
 * import type { Diff, Link } from "./deps/storage.ts";
 *
 * const candidates = new Map<string, Candidate>();
 * const link: Link = {
 *   id: "test-page-id",
 *   title: "TestPage",
 *   project: "project1",
 *   updated: 1000,
 *   links: [],
 *   image: "test.jpg",
 * };
 *
 * addLink(candidates, link);
 * assertEquals(candidates.size, 1);
 *
 * const diff: Diff = {
 *   deleted: new Map([["key1", link]]),
 * };
 *
 * const result = applyDiff(candidates, diff);
 * assertEquals(result.size, 0);
 * ```
 *
 * @example 複合的なDiffを適用
 * ```ts
 * import { assertEquals } from "./deps/testing.ts";
 * import type { Candidate } from "./source.ts";
 * import type { Diff, Link } from "./deps/storage.ts";
 *
 * const candidates = new Map<string, Candidate>();
 * const existingLink: Link = {
 *   id: "existing-page-id",
 *   title: "ExistingPage",
 *   project: "project1",
 *   updated: 1000,
 *   links: [],
 *   image: "existing.jpg",
 * };
 *
 * addLink(candidates, existingLink);
 *
 * const addedLink: Link = {
 *   id: "new-page-id",
 *   title: "NewPage",
 *   project: "project1",
 *   updated: 1500,
 *   links: [],
 *   image: "new.jpg",
 * };
 *
 * const beforeLink: Link = {
 *   id: "existing-page-id",
 *   title: "ExistingPage",
 *   project: "project1",
 *   updated: 1000,
 *   links: [],
 *   image: "existing.jpg",
 * };
 * const afterLink: Link = {
 *   id: "existing-page-id",
 *   title: "ExistingPage",
 *   project: "project1",
 *   updated: 2000,
 *   links: [],
 *   image: "updated.jpg",
 * };
 *
 * const diff: Diff = {
 *   added: new Map([["added_key", addedLink]]),
 *   updated: new Map([["updated_key", [beforeLink, afterLink]]]),
 * };
 *
 * const result = applyDiff(candidates, diff);
 * assertEquals(result.size, 2);
 * assertEquals(result.get("newpage")?.title, "NewPage");
 * assertEquals(result.get("existingpage")?.updated, 2000);
 * assertEquals(
 *   result.get("existingpage")?.metadata.get("project1")?.image,
 *   "updated.jpg",
 * );
 * ```
 */
export const applyDiff = (
  candidates: Map<string, Candidate>,
  diff: Diff,
): Map<string, Candidate> => {
  const result = new Map(candidates);
  if (diff.added) {
    for (const [, link] of diff.added) {
      addLink(result, link);
    }
  }
  if (diff.updated) {
    for (const [, [before, after]] of diff.updated) {
      deleteLink(result, before);
      addLink(result, after);
    }
  }
  if (diff.deleted) {
    for (const [, link] of diff.deleted) {
      deleteLink(result, link);
    }
  }
  return result;
};

/**
 * 候補MapにLinkを追加する
 *
 * @internal
 *
 * @param candidates 候補Map
 * @param link 追加するLink
 *
 * @example 新しいリンクを空のMapに追加
 * ```ts
 * import { assertEquals } from "./deps/testing.ts";
 * import type { Candidate } from "./source.ts";
 * import type { Link } from "./deps/storage.ts";
 *
 * const candidates = new Map<string, Candidate>();
 * const link: Link = {
 *   id: "new-page-id",
 *   title: "NewPage",
 *   project: "testproject",
 *   updated: 1000,
 *   links: ["LinkedPage"],
 *   image: "new.jpg",
 * };
 *
 * addLink(candidates, link);
 *
 * assertEquals(candidates.size, 2); // NewPage + LinkedPage
 * const newPageCandidate = candidates.get("newpage");
 * assertEquals(newPageCandidate?.title, "NewPage");
 * assertEquals(newPageCandidate?.linked, 0);
 * ```
 *
 * @example より新しい更新日時のリンクで既存候補を更新
 * ```ts
 * import { assertEquals } from "./deps/testing.ts";
 * import type { Candidate } from "./source.ts";
 * import type { Link } from "./deps/storage.ts";
 *
 * const candidates = new Map<string, Candidate>();
 * const oldLink: Link = {
 *   id: "test-page-id",
 *   title: "TestPage",
 *   project: "project1",
 *   updated: 1000,
 *   links: [],
 *   image: "old.jpg",
 * };
 * const newLink: Link = {
 *   id: "test-page-id",
 *   title: "TestPage",
 *   project: "project1",
 *   updated: 2000,
 *   links: [],
 *   image: "new.jpg",
 * };
 *
 * addLink(candidates, oldLink);
 * addLink(candidates, newLink);
 *
 * const candidate = candidates.get("testpage");
 * assertEquals(candidate?.updated, 2000);
 * assertEquals(candidate?.metadata.get("project1")?.image, "new.jpg");
 * ```
 *
 * @example 古い更新日時のリンクは無視される
 * ```ts
 * import { assertEquals } from "./deps/testing.ts";
 * import type { Candidate } from "./source.ts";
 * import type { Link } from "./deps/storage.ts";
 *
 * const candidates = new Map<string, Candidate>();
 * const newLink: Link = {
 *   id: "test-page-id",
 *   title: "TestPage",
 *   project: "project1",
 *   updated: 2000,
 *   links: [],
 *   image: "new.jpg",
 * };
 * const oldLink: Link = {
 *   id: "test-page-id",
 *   title: "TestPage",
 *   project: "project1",
 *   updated: 1000,
 *   links: [],
 *   image: "old.jpg",
 * };
 *
 * addLink(candidates, newLink);
 * addLink(candidates, oldLink);
 *
 * const candidate = candidates.get("testpage");
 * assertEquals(candidate?.updated, 2000);
 * assertEquals(candidate?.metadata.get("project1")?.image, "new.jpg");
 * ```
 */
export const addLink = (
  candidates: Map<string, Candidate>,
  link: Link,
): void => {
  const titleLc = toTitleLc(link.title);
  const candidate = candidates.get(titleLc);
  if ((candidate?.updated ?? 0) > link.updated) return;

  const metadata = candidate?.metadata ??
    new Map<string, { image?: string }>();
  metadata.set(link.project, { image: link.image });
  candidates.set(titleLc, {
    title: link.title,
    titleLc,
    updated: link.updated,
    linked: candidate?.linked ?? 0,
    metadata,
  });
  for (const link_ of link.links) {
    const linkLc = toTitleLc(link_);
    const candidate = candidates.get(linkLc);
    const metadata = candidate?.metadata ??
      new Map<string, { image?: string }>();
    metadata.set(
      link.project,
      metadata.get(link.project) ?? { image: link.image },
    );
    candidates.set(linkLc, {
      title: candidate?.title ?? link_,
      titleLc: linkLc,
      updated: candidate?.updated ?? 0,
      linked: (candidate?.linked ?? 0) + 1,
      metadata,
    });
  }
};

/**
 * 候補MapからLinkを削除する
 *
 * @internal
 *
 * @param candidates 候補Map
 * @param link 削除するLink
 *
 * @example 存在するリンクを削除
 * ```ts
 * import { assertEquals } from "./deps/testing.ts";
 * import type { Candidate } from "./source.ts";
 * import type { Link } from "./deps/storage.ts";
 *
 * const candidates = new Map<string, Candidate>();
 * const link: Link = {
 *   id: "test-page-id",
 *   title: "TestPage",
 *   project: "project1",
 *   updated: 1000,
 *   links: ["LinkedPage"],
 *   image: "test.jpg",
 * };
 *
 * addLink(candidates, link);
 * assertEquals(candidates.size, 2);
 *
 * deleteLink(candidates, link);
 * assertEquals(candidates.size, 0); // 両方とも削除される
 * ```
 *
 * @example 複数プロジェクトで使用されているページの一部削除
 * ```ts
 * import { assertEquals } from "./deps/testing.ts";
 * import type { Candidate } from "./source.ts";
 * import type { Link } from "./deps/storage.ts";
 *
 * const candidates = new Map<string, Candidate>();
 * const link1: Link = {
 *   id: "shared-page-id",
 *   title: "SharedPage",
 *   project: "project1",
 *   updated: 1000,
 *   links: [],
 *   image: "img1.jpg",
 * };
 * const link2: Link = {
 *   id: "shared-page-id",
 *   title: "SharedPage",
 *   project: "project2",
 *   updated: 1000,
 *   links: [],
 *   image: "img2.jpg",
 * };
 *
 * addLink(candidates, link1);
 * addLink(candidates, link2);
 *
 * const candidate = candidates.get("sharedpage");
 * assertEquals(candidate?.metadata.size, 2);
 *
 * deleteLink(candidates, link1);
 *
 * const updatedCandidate = candidates.get("sharedpage");
 * assertEquals(updatedCandidate?.metadata.size, 1);
 * assertEquals(updatedCandidate?.metadata.has("project1"), false);
 * assertEquals(updatedCandidate?.metadata.has("project2"), true);
 * ```
 *
 * @example より新しい更新日時の候補は削除されない
 * ```ts
 * import { assertEquals } from "./deps/testing.ts";
 * import type { Candidate } from "./source.ts";
 * import type { Link } from "./deps/storage.ts";
 *
 * const candidates = new Map<string, Candidate>();
 * const newLink: Link = {
 *   id: "test-page-id",
 *   title: "TestPage",
 *   project: "project1",
 *   updated: 2000,
 *   links: [],
 *   image: "new.jpg",
 * };
 * const oldLink: Link = {
 *   id: "test-page-id",
 *   title: "TestPage",
 *   project: "project1",
 *   updated: 1000,
 *   links: [],
 *   image: "old.jpg",
 * };
 *
 * addLink(candidates, newLink);
 * deleteLink(candidates, oldLink);
 *
 * const candidate = candidates.get("testpage");
 * assertEquals(candidate?.updated, 2000);
 * assertEquals(candidates.size, 1);
 * ```
 */
export const deleteLink = (
  candidates: Map<string, Candidate>,
  link: Link,
): void => {
  const titleLc = toTitleLc(link.title);
  const candidate = candidates.get(titleLc);
  if (!candidate || (candidate.updated ?? 0) > link.updated) return;

  const metadata = candidate.metadata;
  metadata.delete(link.project);
  if (metadata.size <= 0) {
    candidates.delete(titleLc);
  } else {
    candidates.set(titleLc, {
      title: candidate.title,
      titleLc,
      updated: link.updated,
      linked: candidate.linked,
      metadata,
    });
  }
  for (const link_ of link.links) {
    const linkLc = toTitleLc(link_);
    const candidate = candidates.get(linkLc);
    if (!candidate) continue;
    const metadata = candidate.metadata;
    metadata.delete(link.project);
    if (metadata.size <= 0) {
      candidates.delete(linkLc);
    } else {
      candidates.set(linkLc, {
        title: candidate.title,
        titleLc: linkLc,
        updated: link.updated,
        linked: candidate.linked - 1,
        metadata,
      });
    }
  }
};
