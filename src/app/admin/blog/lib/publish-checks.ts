/**
 * 發布檢查清單（B 計畫第二段；INTERFACE-stage2.md 第六節）。
 *
 * 🔴 每一項都**只列出、不阻擋**；「照樣發布」永遠按得下去。護欄審 AI，不審書亞。
 * 🔴 consequence 文案逐字照契約第六節那張表，不要「順手潤飾」。
 *
 * 不碰 DB（lawChecks 由 publishAction 現查現算好傳進來）；
 * 封面與內文圖做 best-effort 檔案檢查（fs 掃 public/blog/{segment}/，
 * 本機掃得到；掃不到的環境——例如 Vercel 函式沙箱——就跳過這兩條，不誤報）。
 * ⚠️ 因為用了 node:fs，這支實際上只給 Server 端（actions.ts）import；
 *    Client 端拿檢查結果一律走 publishAction 的回傳。
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { BlogPostData } from "@/lib/blog-db";
import { CTA_BANNED_WORDS, type BlogChecklistItem, type LawCheckItem } from "./types";

/** toc id 白名單：FAQ 的錨點在正文外的 BlFaq 上，正文找不到是正常的。 */
const TOC_ID_WHITELIST = new Set(["faq"]);

/**
 * best-effort 檔案存在檢查。
 * 回傳三態：true＝存在／false＝不存在／null＝這個環境掃不到（跳過，不誤報）。
 * 判斷「掃不掃得到」：public/blog 這個基準目錄在不在——在本機一定在；
 * 部署環境掃不到就整組跳過。
 */
function fileExists(segment: string, file: string): boolean | null {
  try {
    const base = join(process.cwd(), "public", "blog");
    if (!existsSync(base)) return null;
    return existsSync(join(base, segment, file));
  } catch {
    return null;
  }
}

/**
 * 發布前檢查。warn 在前、info 在後（同級之間照契約第六節的表序）。
 * `data`＝要被發布的那一版草稿；`publishedSnapshot`＝線上那一版（比 slug 用）。
 */
export function runPublishChecks(
  data: BlogPostData,
  publishedSnapshot: BlogPostData | null,
  lawChecks: readonly LawCheckItem[]
): readonly BlogChecklistItem[] {
  const warns: BlogChecklistItem[] = [];
  const infos: BlogChecklistItem[] = [];
  const segment = `${data.id}-${data.slug}`;
  const blocks = data.blocks.content;

  // no-cover：cover 空值，或掃得到檔案系統但檔案不在
  const coverState = data.cover === null ? false : fileExists(segment, data.cover);
  if (data.cover === null || coverState === false) {
    warns.push({
      key: "no-cover",
      level: "warn",
      message: data.cover === null ? "這篇還沒有設定封面圖" : `封面圖檔 ${data.cover} 在 public/blog/${segment}/ 裡找不到`,
      consequence:
        "發布後文章首圖會破圖，LINE／FB 分享預覽會一片空白，Google 結構化資料的圖片也會失效。"
    });
  }

  // image-missing：內文 image 節點的檔案找不到（同一套 best-effort）
  for (const block of blocks) {
    if (block.type !== "image") continue;
    if (fileExists(segment, block.attrs.file) === false) {
      warns.push({
        key: "image-missing",
        level: "warn",
        message: `內文圖 ${block.attrs.file || "（檔名空白）"} 在 public/blog/${segment}/ 裡找不到`,
        consequence: "這張內文圖在文章裡會是破圖。"
      });
    }
  }

  // toc-broken：目錄項的 id 對不到正文 heading 錨點（faq 白名單）
  const headingIds = new Set(
    blocks.filter((block) => block.type === "heading").map((block) => block.attrs.id)
  );
  for (const item of data.toc) {
    if (TOC_ID_WHITELIST.has(item.id) || headingIds.has(item.id)) continue;
    warns.push({
      key: "toc-broken",
      level: "warn",
      message: `目錄項「${item.text}」的錨點 ${item.id || "（空白）"} 在正文章節裡對不到`,
      consequence: `讀者點目錄的「${item.text}」不會捲動，會停在原地。`
    });
  }

  // law-diff：引文與參照庫不同
  for (const check of lawChecks) {
    if (check.state !== "diff") continue;
    const lawLabel = check.lawName ?? check.pcode;
    warns.push({
      key: "law-diff",
      level: "warn",
      message: `「${lawLabel} 第 ${check.flno} 條」的引文與參照庫不同`,
      consequence:
        `「${lawLabel} 第 ${check.flno} 條」的引文與參照庫收錄的逐字不同——可能是你改過，` +
        "也可能是修法了、參照庫舊了。系統不會自動改，發布出去的就是你畫面上這一版。"
    });
  }

  // updated-before-published：更新日早於發布日（YYYY-MM-DD 字串可直接比大小）
  if (data.updatedAt !== null && data.updatedAt !== "" && data.updatedAt < data.publishedAt) {
    warns.push({
      key: "updated-before-published",
      level: "warn",
      message: `更新日 ${data.updatedAt} 早於發布日 ${data.publishedAt}`,
      consequence:
        "文章頁與 Google 結構化資料會顯示一個比發布日還早的更新日，讀者和搜尋引擎都會覺得怪。"
    });
  }

  // slug-changed：這次發布會改網址（自動 301 配套）
  if (publishedSnapshot && publishedSnapshot.slug !== data.slug) {
    const oldPath = `/blog/${publishedSnapshot.id}-${publishedSnapshot.slug}`;
    const newPath = `/blog/${data.id}-${data.slug}`;
    warns.push({
      key: "slug-changed",
      level: "warn",
      message: "這次發布會更改文章網址",
      consequence:
        `網址會從 ${oldPath} 變成 ${newPath}。舊網址會自動 301 轉到新網址（已配套），` +
        "但已分享出去的連結要多跳一次，搜尋引擎也要幾天才重新收錄。"
    });
  }

  // no-toclist／no-signature：兩個結構節點不在正文裡
  if (!blocks.some((block) => block.type === "tocList")) {
    warns.push({
      key: "no-toclist",
      level: "warn",
      message: "正文裡沒有目錄區塊",
      consequence: "文章中段不會出現目錄。"
    });
  }
  if (!blocks.some((block) => block.type === "signature")) {
    warns.push({
      key: "no-signature",
      level: "warn",
      message: "正文裡沒有文末署名列區塊",
      consequence: "文末不會有署名列（第三段搬進版型之前，署名還是靠這個區塊輸出）。"
    });
  }

  // ── info 級 ──

  if (!data.excerpt.endsWith("…")) {
    infos.push({
      key: "excerpt-ending",
      level: "info",
      message: "卡片摘要（excerpt）結尾不是全形「…」",
      consequence: "列表卡片上這篇的摘要會跟其他文章長得不一樣（全站慣例以全形刪節號結尾）。"
    });
  }

  if (data.tldr.includes("\n")) {
    infos.push({
      key: "tldr-multiline",
      level: "info",
      message: "重點摘要（TL;DR）含換行",
      consequence: "重點摘要是餵 AI 摘要引擎的單一長段，分段會失去這個功能。"
    });
  }

  if (data.keywords[data.keywords.length - 1] !== "屏東房地產") {
    infos.push({
      key: "keywords-tail",
      level: "info",
      message: "關鍵字最後一項不是「屏東房地產」",
      consequence: "這篇的 JSON-LD 關鍵字結尾會缺全站統一的主詞。"
    });
  }

  if (data.description.length < 130 || data.description.length > 150) {
    infos.push({
      key: "desc-length",
      level: "info",
      message: `描述目前 ${data.description.length} 字，不在 130–150 字建議範圍`,
      consequence: "搜尋結果的描述可能被截斷或顯得太短。"
    });
  }

  for (const word of CTA_BANNED_WORDS) {
    if (!data.ctaLead.includes(word)) continue;
    infos.push({
      key: "cta-banned",
      level: "info",
      message: `CTA 說明段用到「${word}」`,
      consequence: `「${word}」踩到廣告口吻紅線（立即／保證／穩賺這類詞是全站禁用清單）。`
    });
  }

  for (const check of lawChecks) {
    if (check.state !== "missing") continue;
    infos.push({
      key: "law-missing",
      level: "info",
      message: `參照庫沒有「${check.pcode} 第 ${check.flno} 條」`,
      consequence: `參照庫沒有收錄「${check.pcode} 第 ${check.flno} 條」，這段引文沒有逐字比對基準。`
    });
  }

  const noteCount = blocks.filter((block) => block.type === "editorNote").length;
  if (noteCount > 0) {
    infos.push({
      key: "editor-notes",
      level: "info",
      message: `文章裡還有 ${noteCount} 則編輯備註`,
      consequence: `文章裡還有 ${noteCount} 則編輯備註——前台不會顯示、不影響版面，只是提醒你有留白還沒填。`
    });
  }

  return [...warns, ...infos];
}
