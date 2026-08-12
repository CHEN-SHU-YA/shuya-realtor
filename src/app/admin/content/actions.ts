"use server";

/**
 * 官網文案的存檔動作。
 *
 * ⚠️ 檢查不通過一律 **return 訊息，不 throw**。
 * throw 出去畫面只會顯示「Application error」加一串亂碼 digest，
 * 使用者看不到自己哪一格填錯 —— 擋下來卻不告訴人原因，等於沒擋。
 */
import { revalidatePath } from "next/cache";
import { DEFAULT_CONTENT, saveContent, type Award, type HeroPoint, type SiteContent } from "@/lib/content";
import { hasDatabase } from "@/lib/db";

export type ContentActionState = { ok?: boolean; error?: string };

const str = (f: FormData, k: string) => String(f.get(k) || "").replace(/\r\n/g, "\n").trim();

/** 搜尋結果標題超過大約這個長度就會被 Google 截掉，提醒但不擋 —— 那是他的選擇 */
const SEO_TITLE_SOFT_MAX = 60;
const SEO_DESC_SOFT_MAX = 160;

export async function saveSiteContent(formData: FormData): Promise<ContentActionState> {
  if (!hasDatabase) {
    return { error: "還沒接資料庫，改了存不進去。先在 Vercel 的 Storage 建一個 Postgres。" };
  }

  const seoTitle = str(formData, "seoTitle");
  const seoDescription = str(formData, "seoDescription");
  const heroEyebrow = str(formData, "heroEyebrow");
  const heroHeading = str(formData, "heroHeading");
  const heroTagline = str(formData, "heroTagline");
  const heroLead = str(formData, "heroLead");
  const heroNote = str(formData, "heroNote");
  const recordSub = str(formData, "recordSub");
  const recordLead = str(formData, "recordLead");
  const footerSlogan = str(formData, "footerSlogan");

  /**
   * 🔴 必填的欄位空著就擋下來，不要讓它存成空字串。
   * 官網的大標題變成一片空白，你自己不會馬上發現（你早就知道那裡寫什麼），
   * 但每一個進來的客戶都會看到。
   */
  const required: [string, string][] = [
    [seoTitle, "搜尋結果標題"],
    [seoDescription, "搜尋結果描述"],
    [heroHeading, "首頁大標題"],
    [heroLead, "首頁自我介紹"],
    [footerSlogan, "頁尾標語"]
  ];
  for (const [value, label] of required) {
    if (!value) return { error: `「${label}」不能空白` };
  }

  /**
   * 星號要成對。落單的話畫面上會直接印出 `**`，
   * 而且是印在首頁大標題上 —— 這種錯誤在後台看不出來，只有前台看得到。
   */
  const marked: [string, string][] = [
    [heroHeading, "首頁大標題"],
    [heroLead, "首頁自我介紹"],
    [recordLead, "戰績說明"]
  ];
  for (const [value, label] of marked) {
    if ((value.match(/\*\*/g) || []).length % 2 !== 0) {
      return { error: `「${label}」的 ** 沒有成對。要變重點的字前後都要加兩個星號，例如 **精準佈局**` };
    }
  }

  // ── 首頁三個要點 ──
  const heroPoints: HeroPoint[] = [];
  for (let i = 0; i < 6; i += 1) {
    const title = str(formData, `pointTitle${i}`);
    const body = str(formData, `pointBody${i}`);
    if (!title && !body) continue;
    if (!title || !body) return { error: `第 ${i + 1} 個重點的標題與說明要一起填，或一起留空` };
    heroPoints.push({ title, body });
  }
  if (!heroPoints.length) return { error: "首頁至少要留一個重點" };

  // ── 得獎紀錄 ──
  const awards: Award[] = [];
  for (let i = 0; i < 8; i += 1) {
    const year = str(formData, `awardYear${i}`);
    const name = str(formData, `awardName${i}`);
    if (!year && !name) continue;
    if (!year || !name) return { error: `第 ${i + 1} 座獎的年度與名稱要一起填，或一起留空` };
    if (!/^\d{2,4}$/.test(year)) return { error: `第 ${i + 1} 座獎的年度只能填數字（例如 114）` };
    awards.push({ year, name });
  }
  /**
   * 🔴 獎項可以是 0 座 —— 但那會讓「連續獲獎」整區變成空的。
   * 這裡不擋，因為總有一天可能要拿掉；但要講清楚後果，不能讓他改完才發現首頁空一塊。
   */

  const content: SiteContent = {
    ...DEFAULT_CONTENT,
    seoTitle,
    seoDescription,
    heroEyebrow,
    heroHeading,
    heroTagline,
    heroLead,
    heroPoints,
    heroNote,
    recordSub,
    awards,
    recordLead,
    footerSlogan
  };

  try {
    await saveContent(content);
  } catch (error) {
    console.error("[content] 存檔失敗", error);
    return { error: "存不進資料庫。可能是 Neon 剛從休眠醒來，等幾秒再按一次；一直失敗就跟我說。" };
  }

  // 首頁與後台都要重讀，不然存完回首頁看還是舊的
  revalidatePath("/");
  revalidatePath("/admin/content");

  const warnings: string[] = [];
  if (seoTitle.length > SEO_TITLE_SOFT_MAX) {
    warnings.push(`搜尋結果標題 ${seoTitle.length} 字，超過約 ${SEO_TITLE_SOFT_MAX} 字 Google 會截掉後面`);
  }
  if (seoDescription.length > SEO_DESC_SOFT_MAX) {
    warnings.push(`搜尋結果描述 ${seoDescription.length} 字，超過約 ${SEO_DESC_SOFT_MAX} 字 Google 會截掉後面`);
  }
  if (!awards.length) {
    warnings.push("得獎紀錄是空的，首頁「我的戰績」那一區的獎項會不見");
  }
  return { ok: true, error: warnings.length ? `已存檔，但提醒你：${warnings.join("；")}` : undefined };
}

/** 全部改回原本那份文案。改壞了要有路走回來，不然沒人敢動 */
export async function resetSiteContent(): Promise<ContentActionState> {
  if (!hasDatabase) return { error: "還沒接資料庫。" };
  try {
    await saveContent({ ...DEFAULT_CONTENT });
  } catch (error) {
    console.error("[content] 還原失敗", error);
    return { error: "還原失敗，等幾秒再試一次。" };
  }
  revalidatePath("/");
  revalidatePath("/admin/content");
  return { ok: true };
}
