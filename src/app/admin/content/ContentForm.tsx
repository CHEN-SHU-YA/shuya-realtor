"use client";

/**
 * 官網文案編輯表單。
 *
 * ── 三個刻意的設計 ──
 *
 * ① **存檔結果印在按鈕旁邊**，不是跳一個視窗。存完沒有回饋的話，
 *    人會不確定到底存進去沒有，於是再按一次、再去前台看一次，久了就不信任這個畫面。
 *
 * ② **送出中把按鈕鎖住**。連按兩次會有兩個請求同時寫同一筆，後寫的蓋掉先寫的。
 *
 * ③ **每一格底下都寫「這會出現在哪裡」**。後台最常見的問題不是不會用，
 *    是不知道自己在改哪一塊 —— 改完要跑去前台上下捲動找，找不到就放棄了。
 */
import { useActionState, useState } from "react";
import type { SiteContent } from "@/lib/content";
import { resetSiteContent, saveSiteContent, type ContentActionState } from "./actions";

const MAX_POINTS = 6;
const MAX_AWARDS = 8;

function Field({
  label,
  hint,
  children,
  full = true
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
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

export default function ContentForm({
  content,
  updatedAt,
  hasDatabase
}: {
  content: SiteContent;
  updatedAt: string | null;
  hasDatabase: boolean;
}) {
  const [state, formAction, pending] = useActionState<ContentActionState, FormData>(
    async (_prev, formData) => saveSiteContent(formData),
    {}
  );
  const [resetState, resetAction, resetting] = useActionState<ContentActionState, FormData>(
    async () => resetSiteContent(),
    {}
  );

  const [points, setPoints] = useState(content.heroPoints.length);
  const [awards, setAwards] = useState(content.awards.length);

  return (
    <>
      {!hasDatabase && (
        <p className="form-error">
          ⚠️ 這台還沒接資料庫，改了存不進去。線上那份不受影響。
        </p>
      )}

      <form action={formAction}>
        {/* ───────── 搜尋結果 ───────── */}
        <section className="appointment content-block">
          <h2 className="content-h">🔍 Google 搜尋結果</h2>
          <p className="content-desc">
            別人在 Google 搜到你的時候，看到的那兩行字。這一區不會出現在網站畫面上，
            但**它決定人家會不會點進來**。改完 Google 通常要幾天才會更新。
          </p>
          <div className="field-grid">
            <Field
              label="標題"
              hint={`建議 30~60 字。太長 Google 會用「…」截掉。目前 ${content.seoTitle.length} 字`}
            >
              <input name="seoTitle" defaultValue={content.seoTitle} maxLength={200} />
            </Field>
            <Field
              label="描述"
              hint={`建議 80~160 字。要像在跟人講話，不要塞關鍵字。目前 ${content.seoDescription.length} 字`}
            >
              <textarea name="seoDescription" defaultValue={content.seoDescription} rows={4} maxLength={400} />
            </Field>
          </div>
        </section>

        {/* ───────── 首頁最上面 ───────── */}
        <section className="appointment content-block">
          <h2 className="content-h">🏠 首頁最上面那一區</h2>
          <p className="content-desc">
            客戶打開網站第一眼看到的。用 <code>**兩個星號**</code> 包起來的字會變成綠色重點，
            換行就直接按 Enter。
          </p>
          <div className="field-grid">
            <Field label="小標（照片上方那一行）" hint="現在寫的是得獎年度與所屬加盟店">
              <input name="heroEyebrow" defaultValue={content.heroEyebrow} maxLength={120} />
            </Field>
            <Field
              label="大標題"
              hint="最大的那幾個字。用 **星號** 包住要變綠色的部分，例如：為你**精準佈局**每一份資產"
            >
              <textarea name="heroHeading" defaultValue={content.heroHeading} rows={3} maxLength={200} />
            </Field>
            <Field label="標語（大標題下面那一句）" hint="現在是「屏東房產大小事，書亞幫你處理」">
              <input name="heroTagline" defaultValue={content.heroTagline} maxLength={120} />
            </Field>
            <Field label="自我介紹" hint="標語底下那一段。**星號**包住的字會變粗體">
              <textarea name="heroLead" defaultValue={content.heroLead} rows={6} maxLength={800} />
            </Field>
            <Field label="最下面那一句小字" hint="現在是「電話同 LINE，訊息我看到都會回…」">
              <input name="heroNote" defaultValue={content.heroNote} maxLength={200} />
            </Field>
          </div>

          <h3 className="content-h3">三個打勾的重點</h3>
          <p className="content-desc">左邊粗體、右邊說明。留空的那組會自動不顯示。</p>
          {Array.from({ length: points }).map((_, index) => (
            <div className="field-grid content-row" key={index}>
              <Field label={`第 ${index + 1} 個・標題`} full={false}>
                <input name={`pointTitle${index}`} defaultValue={content.heroPoints[index]?.title || ""} maxLength={40} />
              </Field>
              <Field label={`第 ${index + 1} 個・說明`} full={false}>
                <input name={`pointBody${index}`} defaultValue={content.heroPoints[index]?.body || ""} maxLength={120} />
              </Field>
            </div>
          ))}
          {points < MAX_POINTS && (
            <button type="button" className="button-secondary" onClick={() => setPoints((n) => n + 1)}>
              ＋ 再加一個重點
            </button>
          )}
        </section>

        {/* ───────── 戰績 ───────── */}
        <section className="appointment content-block">
          <h2 className="content-h">🏆 我的戰績</h2>
          <p className="content-desc">
            <strong>上面那三個數字方塊會照下面的得獎清單自動算</strong>——
            明年多一座獎，「連續獲獎 2 年」會自己變成 3 年，年度也會自己補上去，不用另外改。
          </p>
          <div className="field-grid">
            <Field label="區塊說明（標題下面那一句）">
              <input name="recordSub" defaultValue={content.recordSub} maxLength={200} />
            </Field>
            <Field label="戰績說明段落" hint="獎牌底下那一段。**星號**包住的字會變粗體">
              <textarea name="recordLead" defaultValue={content.recordLead} rows={5} maxLength={800} />
            </Field>
          </div>

          <h3 className="content-h3">得獎紀錄</h3>
          <p className="content-desc">
            ⚠️ 這一區是<strong>對外的廣告內容</strong>，只能填實際得過的獎。
          </p>
          {Array.from({ length: Math.max(awards, 1) }).map((_, index) => (
            <div className="field-grid content-row" key={index}>
              <Field label={`第 ${index + 1} 座・年度`} full={false}>
                <input
                  name={`awardYear${index}`}
                  defaultValue={content.awards[index]?.year || ""}
                  inputMode="numeric"
                  placeholder="114"
                  maxLength={4}
                />
              </Field>
              <Field label={`第 ${index + 1} 座・獎項名稱`} full={false}>
                <input
                  name={`awardName${index}`}
                  defaultValue={content.awards[index]?.name || ""}
                  placeholder="年度百萬戰將"
                  maxLength={40}
                />
              </Field>
            </div>
          ))}
          {awards < MAX_AWARDS && (
            <button type="button" className="button-secondary" onClick={() => setAwards((n) => n + 1)}>
              ＋ 再加一座獎
            </button>
          )}
        </section>

        {/* ───────── 頁尾 ───────── */}
        <section className="appointment content-block">
          <h2 className="content-h">📄 頁尾</h2>
          <div className="field-grid">
            <Field label="頁尾標語" hint="網站最下面、名字下方那一句">
              <input name="footerSlogan" defaultValue={content.footerSlogan} maxLength={120} />
            </Field>
          </div>
          <p className="content-desc">
            🔒 頁尾的<strong>經紀業名稱、營業員姓名與證號、服務據點</strong>刻意不放在這裡改。
            那是法定要揭露的資訊，改錯就是不實廣告，而畫面上看起來完全正常。要改請找我改程式碼。
          </p>
        </section>

        {state.error && <p className={state.ok ? "form-success" : "form-error"}>⚠️ {state.error}</p>}
        {state.ok && !state.error && (
          <p className="form-success">
            ✅ 已存檔。<a href="/" target="_blank" rel="noreferrer">開新分頁看首頁</a>
          </p>
        )}

        <div className="content-actions">
          <button className="button" type="submit" disabled={pending || !hasDatabase}>
            {pending ? "儲存中…" : "儲存並套用到網站"}
          </button>
          {updatedAt && <span className="content-updated">上次修改：{new Date(updatedAt).toLocaleString("zh-TW")}</span>}
        </div>
      </form>

      <form action={resetAction} className="content-reset">
        <p className="content-desc">改壞了想全部回到原本那份文案：</p>
        {resetState.error && <p className="form-error">⚠️ {resetState.error}</p>}
        {resetState.ok && <p className="form-success">✅ 已還原成預設文案，重新整理這一頁就會看到。</p>}
        <button className="button-secondary" type="submit" disabled={resetting || !hasDatabase}>
          {resetting ? "還原中…" : "全部還原成預設文案"}
        </button>
      </form>
    </>
  );
}
