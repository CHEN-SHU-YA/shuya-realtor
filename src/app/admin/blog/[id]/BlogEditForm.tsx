"use client";

/**
 * 文章編輯表單（B 計畫第二段的主 Client 元件）。
 *
 * ── ContentForm 的三規矩全要（01 文件）──
 * ① 存檔結果印在按鈕旁邊，不跳視窗；② pending 鎖按鈕防連按雙寫；
 * ③ 每一格底下寫「這會出現在哪裡」。
 *
 * ── 這個畫面的規矩（書亞 2026-08-16 拍板，設計法律）──
 * 🔴 文章內容零鎖、零阻擋式警告、零唯讀（唯一唯讀的「編號」不是文章內容，
 *    是方案書第八節明定的網址規則；發布日照 00 方案書第三節①「可改＋標示」）。
 * 🔴 所有字數／格式檢查**只提示不擋存檔**；發布檢查清單只列出、
 *    「照樣發布」永遠按得下去。護欄審 AI，不審書亞。
 * 🔴 樂觀鎖衝突：明白說「這篇在別的視窗被改過」並給選項（重新整理／
 *    先把這版複製出來），**不靜默蓋掉**（01 文件點名的互蓋風險）。
 * 🔴 發布時畫面有未存檔修改 → 先自動存一版（note＝「發布前自動存檔」）
 *    再發布——發布的一定是畫面上看到的這一版（契約定案 #5）。
 *
 * 區塊順序照文章頁由上而下（types.ts「欄位順序≒畫面順序」），編輯器夾在中間。
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import type { JSONContent } from "@tiptap/core";
import type { BlogDocJson } from "@/content/blocks/types";
import type { CategorySlug } from "@/content/posts/types";
import type { BlogPostData, BlogPostRow } from "@/lib/blog-db";
import { publishAction, saveDraftAction, updateLawRefAction } from "../actions";
import { formatTaipei } from "../lib/format";
import { normalizeEditorDoc } from "../lib/normalize";
import { CTA_BANNED_WORDS, type BlogChecklistItem, type LawCheckItem } from "../lib/types";
import BlogEditor from "./editor/BlogEditor";

/** 欄位外框（照 ContentForm 的 Field 抄；hint 開放 ReactNode 好塞即時標示）。 */
function Field({
  label,
  hint,
  children,
  full = true
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  full?: boolean;
}) {
  return (
    <div className={full ? "field full" : "field"}>
      <label>{label}</label>
      {children}
      {hint ? <p className="content-hint">{hint}</p> : null}
    </div>
  );
}

/** 字數（以 Unicode code point 算，中文一字＝1）。 */
function len(text: string): number {
  return [...text].length;
}

/** textarea 值的統一清理（照 content/actions.ts 的 str()：\r\n 正規化＋trim）。 */
function clean(text: string): string {
  return text.replace(/\r\n/g, "\n").trim();
}

/** 關鍵字欄：頓號或換行分隔 → 陣列。 */
function parseKeywords(text: string): string[] {
  return text
    .split(/[、\n]/)
    .map((word) => word.trim())
    .filter(Boolean);
}

/** 從編輯器 JSON 撈頂層 heading 的 (id, text)——目錄對照與「重抓錨點」用。 */
function scanHeadings(doc: JSONContent): { id: string; text: string }[] {
  return (doc.content ?? [])
    .filter((node) => node.type === "heading")
    .map((node) => ({
      id: String((node.attrs as { id?: unknown } | undefined)?.id ?? ""),
      text: (node.content ?? []).map((run) => run.text ?? "").join("")
    }));
}

function sameHeadings(
  a: readonly { id: string; text: string }[],
  b: readonly { id: string; text: string }[]
): boolean {
  return a.length === b.length && a.every((h, i) => h.id === b[i].id && h.text === b[i].text);
}

export default function BlogEditForm({
  row,
  categories
}: {
  row: BlogPostRow;
  /** 分類清單（Server 殼縮成可序列化小陣列傳進來，Client 不 import @/lib/blog）。 */
  categories: readonly { slug: CategorySlug; name: string }[];
}) {
  const data = row.data;
  /** 圖片預覽路徑：編輯頁載入時定死；slug 改了要存檔重整才跟上（契約 §4.4）。 */
  const imageBase = `/blog/${data.id}-${data.slug}`;

  // ── 樂觀鎖 token 與正文 ──
  const [token, setToken] = useState(row.updatedAt);
  const docRef = useRef<JSONContent>(data.blocks as JSONContent);
  const [headings, setHeadings] = useState(() => scanHeadings(data.blocks as JSONContent));

  // ── metadata 表單值 ──
  const [title, setTitle] = useState(data.title);
  const [description, setDescription] = useState(data.description);
  const [category, setCategory] = useState<CategorySlug>(data.category);
  const [keywordsText, setKeywordsText] = useState(data.keywords.join("、"));
  const [slug, setSlug] = useState(data.slug);
  const [publishedDate, setPublishedDate] = useState(data.publishedAt);
  const [updatedDate, setUpdatedDate] = useState(data.updatedAt ?? "");
  const [cover, setCover] = useState(data.cover ?? "");
  const [coverBroken, setCoverBroken] = useState(false);
  const [verdictQ, setVerdictQ] = useState(data.verdict.q);
  const [verdictABold, setVerdictABold] = useState(data.verdict.aBold);
  const [verdictARest, setVerdictARest] = useState(data.verdict.aRest);
  const [verdictNote, setVerdictNote] = useState(data.verdict.note);
  const [tldr, setTldr] = useState(data.tldr);
  const [tocRows, setTocRows] = useState(data.toc.map((item) => ({ ...item })));
  const [faqRows, setFaqRows] = useState(data.faq.map((item) => ({ ...item })));
  const [excerpt, setExcerpt] = useState(data.excerpt);
  const [ctaLead, setCtaLead] = useState(data.ctaLead);

  // ── 狀態 ──
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{
    ok: boolean;
    text: string;
    /** 給工程看的技術細節（normalize 的原始 problems）——收進可展開區塊，不拼進主訊息。 */
    details?: readonly string[];
  } | null>(null);
  const [pubMsg, setPubMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [conflict, setConflict] = useState(false);
  const [lawChecks, setLawChecks] = useState<readonly LawCheckItem[]>([]);
  /** 發布檢查清單彈出層（needs-confirm 時開）。 */
  const [checklist, setChecklist] = useState<readonly BlogChecklistItem[] | null>(null);
  /** 最近一次成功發布時的清單（畫面留紀錄）。 */
  const [lastChecklist, setLastChecklist] = useState<readonly BlogChecklistItem[]>([]);

  /** 任何欄位改動：標記 dirty（離開頁面會提醒）。 */
  const touch = () => setDirty(true);

  /** 編輯器每次變動：收最新 JSON＋更新 heading 對照（目錄徽章要即時）。 */
  const handleDocChange = useCallback((doc: JSONContent) => {
    docRef.current = doc;
    setDirty(true);
    setHeadings((prev) => {
      const next = scanHeadings(doc);
      return sameHeadings(prev, next) ? prev : next;
    });
  }, []);

  /** dirty 時關頁提醒（瀏覽器原生對話框；不是鎖，按離開照樣走）。 */
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  /** 表單值＋正文 → 完整一包 BlogPostData（id 凍結原樣帶回；發布日可改，清空＝維持原值）。 */
  function buildData(blocks: BlogDocJson): BlogPostData {
    return {
      id: data.id,
      slug: slug.trim(),
      title: clean(title),
      description: clean(description),
      category,
      keywords: parseKeywords(keywordsText),
      publishedAt: publishedDate.trim() === "" ? data.publishedAt : publishedDate.trim(),
      updatedAt: updatedDate.trim() === "" ? null : updatedDate.trim(),
      cover: cover.trim() === "" ? null : cover.trim(),
      excerpt: clean(excerpt),
      verdict: {
        q: clean(verdictQ),
        aBold: clean(verdictABold),
        aRest: clean(verdictARest),
        note: clean(verdictNote)
      },
      tldr: clean(tldr),
      toc: tocRows
        .map((item) => ({ id: item.id.trim(), text: item.text.trim() }))
        .filter((item) => item.id || item.text),
      faq: faqRows
        .map((item) => ({ q: clean(item.q), a: clean(item.a) }))
        .filter((item) => item.q || item.a),
      blocks,
      ctaLead: clean(ctaLead)
    };
  }

  /** 存檔（手動或發布前自動）。成功回新 token，失敗回 null（訊息已印在按鈕旁）。 */
  async function doSave(note?: string): Promise<{ updatedAt: string } | null> {
    const normalized = normalizeEditorDoc(docRef.current);
    if (!normalized.ok) {
      setSaveMsg({
        ok: false,
        text:
          "編輯器存出來的格式有問題，這是程式的錯、不是你的操作——你的內容沒有遺失，" +
          "重新整理後再試一次；持續發生就把下面的「技術細節」展開、整個畫面截圖給工程。",
        details: normalized.problems
      });
      return null;
    }
    setSaving(true);
    try {
      const result = await saveDraftAction({
        data: buildData(normalized.doc),
        expectedUpdatedAt: token,
        note
      });
      if (!result.ok) {
        setConflict(result.reason === "conflict");
        setSaveMsg({ ok: false, text: result.error, details: result.details });
        return null;
      }
      setToken(result.updatedAt);
      setLawChecks(result.lawChecks);
      setDirty(false);
      setConflict(false);
      const diffCount = result.lawChecks.filter((check) => check.state === "diff").length;
      const missingCount = result.lawChecks.filter((check) => check.state === "missing").length;
      const extras = [...result.hints];
      if (diffCount) extras.push(`${diffCount} 段法條引文與參照庫不同（法條區塊上有標示，點開可比對）`);
      if (missingCount) extras.push(`${missingCount} 條參照庫沒收錄（沒有比對基準，不是錯誤）`);
      setSaveMsg({
        ok: true,
        text: `已儲存 ${result.savedAtLabel}` + (extras.length ? `。${extras.join("；")}` : "")
      });
      return { updatedAt: result.updatedAt };
    } catch (error) {
      console.error("[BlogEditForm] 存檔失敗", error);
      setSaveMsg({ ok: false, text: "存檔沒送出去（網路或伺服器暫時有狀況），等幾秒再按一次。" });
      return null;
    } finally {
      setSaving(false);
    }
  }

  /** 發布流程（契約 §3.3）：dirty 先自動存檔 → publishAction → 清單／成功。 */
  async function doPublish(confirmed: boolean) {
    setPublishing(true);
    setPubMsg(null);
    try {
      let currentToken = token;
      if (dirty) {
        const saved = await doSave("發布前自動存檔");
        if (!saved) {
          setPubMsg({
            ok: false,
            text: "發布前的自動存檔沒成功，已中止發布——先看儲存那邊的訊息。"
          });
          setChecklist(null);
          return;
        }
        currentToken = saved.updatedAt;
      }
      const result = await publishAction({
        id: data.id,
        expectedUpdatedAt: currentToken,
        confirmed
      });
      if (!result.ok && result.reason === "needs-confirm") {
        setChecklist(result.checklist);
        return;
      }
      if (!result.ok) {
        setChecklist(null);
        setPubMsg({ ok: false, text: result.error });
        return;
      }
      setToken(result.updatedAt);
      setChecklist(null);
      setLastChecklist(result.checklist);
      let text = `已發布（線上版本時間 ${formatTaipei(result.publishedAt)}）`;
      if (result.slugChanged && result.redirectFrom) {
        text += `。網址有改：舊網址 ${result.redirectFrom} 已自動 301 轉到新網址`;
      }
      text += "。第二段期間正式站還在讀舊系統，這次發布只更新資料庫的線上版本，正式站不會動。";
      setPubMsg({ ok: true, text });
    } catch (error) {
      console.error("[BlogEditForm] 發布失敗", error);
      setPubMsg({ ok: false, text: "發布沒送出去（網路或伺服器暫時有狀況），等幾秒再按一次。" });
    } finally {
      setPublishing(false);
    }
  }

  /** 衝突時的逃生門：把畫面上這一版（含正文 JSON）複製到剪貼簿。 */
  async function copyMyVersion() {
    const normalized = normalizeEditorDoc(docRef.current);
    const blocks = normalized.ok ? normalized.doc : (docRef.current as BlogDocJson);
    try {
      await navigator.clipboard.writeText(JSON.stringify(buildData(blocks), null, 2));
      setSaveMsg({
        ok: true,
        text: "已把你這版（含正文）複製到剪貼簿——先貼到記事本存著，再重新整理看最新版。"
      });
    } catch {
      setSaveMsg({ ok: false, text: "剪貼簿沒開權限——手動全選正文複製一份再重新整理。" });
    }
  }

  /** 「從正文重抓錨點」：照正文 heading 重排目錄；id 相同的保留他改過的文字。 */
  function syncTocFromBody() {
    const bodyRows = headings.map((heading) => {
      const existing = tocRows.find((item) => item.id !== "" && item.id === heading.id);
      return { id: heading.id, text: existing ? existing.text : heading.text };
    });
    const faqRowsKept = tocRows.filter((item) => item.id === "faq");
    setTocRows([...bodyRows, ...faqRowsKept]);
    setDirty(true);
  }

  /** 目錄列的狀態徽章（id:"faq" 白名單——FAQ 的錨點在正文外的 BlFaq 上）。 */
  function tocState(id: string): { ok: boolean; text: string } {
    if (id.trim() === "faq") return { ok: true, text: "FAQ 項（錨點在正文外，正常）" };
    if (headings.some((heading) => heading.id === id.trim() && id.trim() !== "")) {
      return { ok: true, text: "對得到章節" };
    }
    return { ok: false, text: "對不到章節——讀者點了不會捲動（不擋存檔）" };
  }

  const keywords = parseKeywords(keywordsText);
  const keywordsTailOk = keywords[keywords.length - 1] === "屏東房地產";
  /** 更新日比對用的發布日：欄位清空時退回原值（跟存檔行為一致）。 */
  const effectivePublishedDate = publishedDate.trim() === "" ? data.publishedAt : publishedDate.trim();
  const bannedHits = CTA_BANNED_WORDS.filter((word) => ctaLead.includes(word));
  const coverSrc = `/blog/${data.id}-${data.slug}/${cover.trim() || "cover.png"}`;
  const descLen = len(clean(description));

  return (
    <>
      {/* ───────── 📄 基本 ───────── */}
      <section className="appointment content-block">
        <h2 className="content-h">📄 基本</h2>
        <div className="field-grid">
          <Field
            label="標題"
            hint="＝h1＝JSON-LD headline＝封面 alt，三處逐字相同（程式自動同步）"
          >
            <input value={title} onChange={(e) => (setTitle(e.target.value), touch())} />
          </Field>
          <Field
            label="描述 description"
            hint={
              <>
                搜尋結果與分享預覽用這段。目前{" "}
                <span className={descLen < 130 || descLen > 150 ? "bab-flag" : "bab-ok"}>
                  {descLen} 字
                </span>
                （建議 130–150 字——只是提醒，不擋存檔）
              </>
            }
          >
            <textarea
              value={description}
              rows={4}
              onChange={(e) => (setDescription(e.target.value), touch())}
            />
          </Field>
          <Field label="分類" hint="一篇只掛一個；slug 在公開網址上，選單保證選到的都合法">
            <select
              value={category}
              onChange={(e) => (setCategory(e.target.value as CategorySlug), touch())}
            >
              {categories.map((item) => (
                <option key={item.slug} value={item.slug}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="關鍵字"
            hint={
              <>
                頓號或換行分隔。目前{" "}
                <span className={keywords.length < 20 || keywords.length > 26 ? "bab-flag" : "bab-ok"}>
                  {keywords.length} 個
                </span>
                （建議 20–26）。
                {keywordsTailOk ? (
                  <span className="bab-ok">最後一項是「屏東房地產」✓</span>
                ) : (
                  <>
                    <span className="bab-flag">最後一項不是全站統一的「屏東房地產」</span>{" "}
                    <button
                      type="button"
                      className="button-secondary"
                      onClick={() => (
                        setKeywordsText((prev) => (prev.trim() ? `${prev.trim()}、屏東房地產` : "屏東房地產")),
                        touch()
                      )}
                    >
                      補上
                    </button>
                  </>
                )}
              </>
            }
          >
            <textarea
              value={keywordsText}
              rows={3}
              onChange={(e) => (setKeywordsText(e.target.value), touch())}
            />
          </Field>
        </div>
      </section>

      {/* ───────── 🔗 網址與日期 ───────── */}
      <section className="appointment content-block">
        <h2 className="content-h">🔗 網址與日期</h2>
        <div className="field-grid content-row">
          <Field label="編號" hint="網址的一部分，發布後永久凍結（不是內容鎖，是網址規則）" full={false}>
            <input value={String(data.id)} readOnly />
          </Field>
          <Field
            label="發布日"
            hint={
              <>
                改了發布日，Google 會把這篇當成新文章、排名重新累積。
                {publishedDate.trim() === "" && (
                  <span className="bab-flag">
                    目前是空的——存檔不會清掉發布日，會維持原本的 {data.publishedAt}
                  </span>
                )}
              </>
            }
            full={false}
          >
            <input
              type="date"
              value={publishedDate}
              onChange={(e) => (setPublishedDate(e.target.value), touch())}
            />
          </Field>
        </div>
        <div className="field-grid">
          <Field
            label="網址 slug"
            hint="已上線的文章改網址，舊連結會斷——發布時系統自動把舊網址記進 301 轉址表"
          >
            <input value={slug} onChange={(e) => (setSlug(e.target.value), touch())} />
          </Field>
          <Field
            label="更新日"
            hint={
              <>
                可清空（＝沒改過，前台顯示發布日）。
                {updatedDate && updatedDate < effectivePublishedDate && (
                  <span className="bab-flag">
                    目前早於發布日 {effectivePublishedDate}——讀者和搜尋引擎都會覺得怪（不擋存檔）
                  </span>
                )}
              </>
            }
          >
            <input
              type="date"
              value={updatedDate}
              onChange={(e) => (setUpdatedDate(e.target.value), touch())}
            />
          </Field>
        </div>
      </section>

      {/* ───────── 🖼 封面 ───────── */}
      <section className="appointment content-block">
        <h2 className="content-h">🖼 封面</h2>
        <div className="field-grid">
          <Field
            label="封面圖檔名"
            hint={
              <>
                實體檔案放 public/blog/{data.id}-{data.slug}/（圖片上傳是第四段，現在先填檔名）。
                {(cover.trim() === "" || coverBroken) && (
                  <span className="bab-flag">
                    {cover.trim() === "" ? "還沒填封面檔名" : "縮圖載不出來"}
                    ——發布後首圖破、LINE／FB 分享預覽一片白（發布檢查也會列，不擋）
                  </span>
                )}
              </>
            }
          >
            <input
              value={cover}
              placeholder="cover.png"
              onChange={(e) => (setCover(e.target.value), setCoverBroken(false), touch())}
            />
          </Field>
        </div>
        {/* 縮圖直接掛在正式路徑上：檔名錯就現出破圖——看得見的回饋 */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="bab-cover-thumb"
          src={coverSrc}
          alt="封面縮圖預覽"
          onError={() => setCoverBroken(true)}
          onLoad={() => setCoverBroken(false)}
        />
      </section>

      {/* ───────── 🎯 一句話結論 ───────── */}
      <section className="appointment content-block">
        <h2 className="content-h">🎯 一句話結論</h2>
        <p className="content-desc">文章開頭那塊綠框。四格分開存，程式組版面，不會破版。</p>
        <div className="field-grid">
          <Field label="問句 q" hint={<>目前 {len(clean(verdictQ))} 字（建議 20–25）</>}>
            <input value={verdictQ} onChange={(e) => (setVerdictQ(e.target.value), touch())} />
          </Field>
          <Field
            label="結論句 aBold"
            hint={<>整段自動變粗體。目前 {len(clean(verdictABold))} 字（建議 100–110）</>}
          >
            <textarea
              value={verdictABold}
              rows={3}
              onChange={(e) => (setVerdictABold(e.target.value), touch())}
            />
          </Field>
          <Field
            label="補充說明 aRest"
            hint={<>目前 {len(clean(verdictARest))} 字（建議 280–300）</>}
          >
            <textarea
              value={verdictARest}
              rows={6}
              onChange={(e) => (setVerdictARest(e.target.value), touch())}
            />
          </Field>
          <Field
            label="免責小字 note"
            hint={<>開頭的「※ 」程式自動補，不要自己打。目前 {len(clean(verdictNote))} 字（建議約 120）</>}
          >
            <textarea
              value={verdictNote}
              rows={3}
              onChange={(e) => (setVerdictNote(e.target.value), touch())}
            />
          </Field>
        </div>
      </section>

      {/* ───────── 📝 重點摘要 ───────── */}
      <section className="appointment content-block">
        <h2 className="content-h">📝 重點摘要（TL;DR）</h2>
        <div className="field-grid">
          <Field
            label="重點摘要"
            hint={
              <>
                目前 {len(clean(tldr))} 字（建議 750–900）。
                {clean(tldr).includes("\n") && (
                  <span className="bab-flag">
                    這段是餵 AI 摘要引擎的單一長段，分段會失去這個功能（不擋存檔）
                  </span>
                )}
              </>
            }
          >
            <textarea value={tldr} rows={9} onChange={(e) => (setTldr(e.target.value), touch())} />
          </Field>
        </div>
      </section>

      {/* ───────── 🧭 目錄 ───────── */}
      <section className="appointment content-block">
        <h2 className="content-h">🧭 目錄</h2>
        <p className="content-desc">
          正文中段的目錄從這份清單輸出（正文裡那張「目錄（自動生成）」占位卡就是它的位置）。
          id 要對到正文章節的錨點；對不到會掛標示，但不擋存檔。
        </p>
        {tocRows.map((item, index) => {
          const state = tocState(item.id);
          return (
            <div className="field-grid content-row" key={index}>
              <Field
                label={`第 ${index + 1} 項・錨點 id`}
                hint={<span className={state.ok ? "bab-ok" : "bab-flag"}>{state.text}</span>}
                full={false}
              >
                <input
                  value={item.id}
                  onChange={(e) => (
                    setTocRows((rows) =>
                      rows.map((r, i) => (i === index ? { ...r, id: e.target.value } : r))
                    ),
                    touch()
                  )}
                />
              </Field>
              <Field label={`第 ${index + 1} 項・目錄文字`} hint="兩欄一起清空＝存檔時拿掉這一項" full={false}>
                <input
                  value={item.text}
                  onChange={(e) => (
                    setTocRows((rows) =>
                      rows.map((r, i) => (i === index ? { ...r, text: e.target.value } : r))
                    ),
                    touch()
                  )}
                />
              </Field>
            </div>
          );
        })}
        <div className="content-actions">
          <button
            type="button"
            className="button-secondary"
            onClick={() => (setTocRows((rows) => [...rows, { id: "", text: "" }]), touch())}
          >
            ＋ 再加一項
          </button>
          <button type="button" className="button-secondary" onClick={syncTocFromBody}>
            從正文重抓錨點（id 相同的保留你改過的文字）
          </button>
        </div>
      </section>

      {/* ───────── ✍️ 正文 ───────── */}
      <section className="appointment content-block">
        <h2 className="content-h">✍️ 正文</h2>
        <p className="content-desc">
          點哪句改哪句，選字加粗、貼網址成連結。法條區塊帶常駐標示（內容照樣可編輯，標示不是鎖）；
          黃便利貼是給你的編輯備註，前台不會顯示。
        </p>
        <BlogEditor
          postId={data.id}
          initialDoc={data.blocks}
          imageBase={imageBase}
          onChange={handleDocChange}
          lawChecks={lawChecks}
          onUpdateLawRef={(ref) => updateLawRefAction(ref)}
        />
      </section>

      {/* ───────── ❓ 常見問題 ───────── */}
      <section className="appointment content-block">
        <h2 className="content-h">❓ 常見問題</h2>
        <p className="content-desc">
          這份同時是畫面與 Google 結構化資料，兩邊永遠同一份。目前 {faqRows.filter((r) => r.q.trim() || r.a.trim()).length} 題
          （慣例：精簡版 8 題、旗艦版 12 題——提醒不擋）。
        </p>
        {faqRows.map((item, index) => (
          <div className="repeat-row" key={index}>
            <p className="repeat-no">第 {index + 1} 題</p>
            <div className="field-grid">
              <Field label="問題 q" hint="＝畫面上的問題列＝JSON-LD Question.name，一個標點都不能差">
                <input
                  value={item.q}
                  onChange={(e) => (
                    setFaqRows((rows) =>
                      rows.map((r, i) => (i === index ? { ...r, q: e.target.value } : r))
                    ),
                    touch()
                  )}
                />
              </Field>
              <Field label="答案 a" hint="純文字；兩欄一起清空＝存檔時拿掉這一題">
                <textarea
                  value={item.a}
                  rows={3}
                  onChange={(e) => (
                    setFaqRows((rows) =>
                      rows.map((r, i) => (i === index ? { ...r, a: e.target.value } : r))
                    ),
                    touch()
                  )}
                />
              </Field>
            </div>
          </div>
        ))}
        <button
          type="button"
          className="button-secondary"
          onClick={() => (setFaqRows((rows) => [...rows, { q: "", a: "" }]), touch())}
        >
          ＋ 再加一題
        </button>
      </section>

      {/* ───────── 📣 CTA ───────── */}
      <section className="appointment content-block">
        <h2 className="content-h">📣 卡片摘要與 CTA</h2>
        <div className="field-grid">
          <Field
            label="卡片摘要 excerpt"
            hint={
              <>
                列表／分類頁的卡片用這段。目前 {len(clean(excerpt))} 字（建議 100–160）。
                {!clean(excerpt).endsWith("…") && (
                  <span className="bab-flag">全站慣例以全形「…」結尾——這篇目前不是（不擋存檔）</span>
                )}
              </>
            }
          >
            <textarea value={excerpt} rows={3} onChange={(e) => (setExcerpt(e.target.value), touch())} />
          </Field>
          <Field
            label="CTA 說明段 ctaLead"
            hint={
              <>
                文末 CTA 卡的說明，每篇要換。目前 {len(clean(ctaLead))} 字（建議 45–55）。
                {bannedHits.length > 0 && (
                  <span className="bab-flag">
                    用到禁用詞：{bannedHits.map((word) => `「${word}」`).join("")}——廣告口吻紅線（不擋存檔，發布檢查會再列一次）
                  </span>
                )}
              </>
            }
          >
            <textarea value={ctaLead} rows={2} onChange={(e) => (setCtaLead(e.target.value), touch())} />
          </Field>
        </div>
      </section>

      {/* ───────── 動作列（sticky 置底） ───────── */}
      <div className="bab-actions">
        <button type="button" className="button" onClick={() => void doSave()} disabled={saving || publishing}>
          {saving ? "儲存中…" : "儲存"}
        </button>
        <Link
          className="button-secondary"
          href={`/admin/blog/${data.id}/preview`}
          target="_blank"
          rel="noreferrer"
        >
          預覽（開新分頁）
        </Link>
        <button
          type="button"
          className="button"
          onClick={() => void doPublish(false)}
          disabled={saving || publishing}
        >
          {publishing ? "發布中…" : "發布"}
        </button>
        <Link className="button-secondary" href={`/admin/blog/${data.id}/history`}>
          版本
        </Link>
        {dirty && <span className="bab-result">✏️ 有還沒存檔的修改（預覽看的是最後一次存檔）</span>}
        {saveMsg && (
          <span className={`bab-result ${saveMsg.ok ? "okk" : "err"}`}>
            {saveMsg.ok ? "✅" : "⚠️"} {saveMsg.text}
          </span>
        )}
        {conflict && (
          <button type="button" className="button-secondary" onClick={() => void copyMyVersion()}>
            先把我這版複製出來
          </button>
        )}
        {pubMsg && (
          <span className={`bab-result ${pubMsg.ok ? "okk" : "err"}`}>
            {pubMsg.ok ? "✅" : "⚠️"} {pubMsg.text}
          </span>
        )}
      </div>

      {/* 存檔訊息的技術細節（normalize 的原始 problems）——可展開區塊，不拼進主訊息 */}
      {saveMsg && !saveMsg.ok && saveMsg.details && saveMsg.details.length > 0 && (
        <section className="appointment content-block">
          <details>
            <summary>技術細節（給工程看的——回報時把這塊展開一起截圖）</summary>
            <ul>
              {saveMsg.details.map((problem, index) => (
                <li key={index}>{problem}</li>
              ))}
            </ul>
          </details>
        </section>
      )}

      {/* 最近一次成功發布時的清單（留紀錄） */}
      {pubMsg?.ok && lastChecklist.length > 0 && (
        <section className="appointment content-block">
          <h2 className="content-h">🧾 這次發布時的檢查清單（紀錄）</h2>
          {lastChecklist.map((item, index) => (
            <div className="bab-check-item" key={`${item.key}-${index}`}>
              <span className={`bab-badge${item.level === "warn" ? " bab-badge-warn" : ""}`}>
                {item.level === "warn" ? "注意" : "提醒"}
              </span>{" "}
              <strong>{item.message}</strong>
              <p>{item.consequence}</p>
            </div>
          ))}
        </section>
      )}

      {/* ───────── 發布檢查清單彈出層（只列出、不阻擋） ───────── */}
      {checklist && (
        <div className="bab-modal-backdrop" role="dialog" aria-modal="true">
          <div className="bab-modal">
            <h3>發布前，看一下這幾件事</h3>
            <p className="bab-modal-desc">
              每一條都寫了發布後會發生什麼。這只是清單，不會擋你——看完由你決定。
            </p>
            {checklist.map((item, index) => (
              <div className="bab-check-item" key={`${item.key}-${index}`}>
                <span className={`bab-badge${item.level === "warn" ? " bab-badge-warn" : ""}`}>
                  {item.level === "warn" ? "注意" : "提醒"}
                </span>{" "}
                <strong>{item.message}</strong>
                <p>{item.consequence}</p>
              </div>
            ))}
            <div className="bab-modal-actions">
              <button
                type="button"
                className="button"
                onClick={() => void doPublish(true)}
                disabled={publishing}
              >
                {publishing ? "發布中…" : "照樣發布"}
              </button>
              <button
                type="button"
                className="button-secondary"
                onClick={() => setChecklist(null)}
                disabled={publishing}
              >
                先不發
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
