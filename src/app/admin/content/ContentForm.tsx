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
import {
  MAX_ARTICLES,
  MAX_MEDIA,
  MAX_REVIEWS,
  MAX_TOOLS,
  SECTION_LABELS,
  type SectionKey,
  type SiteContent
} from "@/lib/content";
import { resetSiteContent, saveSiteContent, type ContentActionState } from "./actions";

const MAX_POINTS = 6;
const MAX_AWARDS = 8;

/**
 * 「上次修改」的時間字串，自己排版。
 *
 * 🔴 **不要用 `toLocaleString`。** 就算指定了 `timeZone: "Asia/Taipei"`，
 * 伺服器（Node）與瀏覽器（Chrome）的 ICU 版本不同，「下午7:48」中間吐出來的空白
 * 有時是一般空格、有時是 U+202F 窄不斷行空格 —— 肉眼一模一樣，但字串不相等，
 * React 會判定 hydration 失敗，整個表單在客戶端重畫一次。
 *
 * 台北固定 UTC+8、沒有日光節約，所以直接位移 8 小時再讀 UTC 欄位，
 * 不管伺服器在哪個時區都算得出同一組數字。
 */
function formatTaipei(iso: string) {
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) return "";
  const d = new Date(ms + 8 * 60 * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}/${p(d.getUTCMonth() + 1)}/${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

/**
 * 區塊開關。
 *
 * 這是整個後台最重要的一顆按鈕：**沒做完的區塊先關著，前台完全不出現**，
 * 填完再打開。所以它放在每一區的最上面、有底色、看得到現在是開還是關 ——
 * 藏在下面的話，他會以為存檔就等於上線。
 */
function SectionSwitch({
  section,
  defaultOn,
  note
}: {
  section: SectionKey;
  defaultOn: boolean;
  note: string;
}) {
  const [on, setOn] = useState(defaultOn);
  return (
    <label className={`section-switch${on ? " on" : ""}`}>
      <input
        type="checkbox"
        name={`section_${section}`}
        defaultChecked={defaultOn}
        onChange={(event) => setOn(event.currentTarget.checked)}
      />
      <span className="ss-state">{on ? "✅ 已顯示在官網" : "🚧 先隱藏（還沒做完）"}</span>
      <span className="ss-note">{on ? note : `打勾之後，「${SECTION_LABELS[section]}」才會出現在官網上`}</span>
    </label>
  );
}

/** 一列可重複填的資料（評價／報導／文章／工具共用同一種排版） */
function RepeatBlock({
  count,
  max,
  onAdd,
  addLabel,
  children
}: {
  count: number;
  max: number;
  onAdd: () => void;
  addLabel: string;
  children: (index: number) => React.ReactNode;
}) {
  return (
    <>
      {Array.from({ length: Math.max(count, 1) }).map((_, index) => (
        <div className="repeat-row" key={index}>
          <p className="repeat-no">第 {index + 1} 筆</p>
          {children(index)}
        </div>
      ))}
      {count < max && (
        <button type="button" className="button-secondary" onClick={onAdd}>
          {addLabel}
        </button>
      )}
    </>
  );
}

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
  const [reviews, setReviews] = useState(content.reviews.length);
  const [media, setMedia] = useState(content.mediaItems.length);
  const [articles, setArticles] = useState(content.articles.length);
  const [tools, setTools] = useState(content.toolItems.length);

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

        {/* ───────── 為什麼找我 ───────── */}
        <section className="appointment content-block">
          <h2 className="content-h">✅ 為什麼找我</h2>
          <SectionSwitch
            section="why"
            defaultOn={content.sections.why}
            note="首頁「把房子交給我之前，先確認這四件事」那一區"
          />
          <p className="content-desc">
            這一區的四張卡<strong>沒有可以改的欄位</strong>——
            內容全部自動來自你的得獎紀錄、營業員證號、加盟店名與門市地址。
            證號或地址要改，請找我改程式碼（那是法定揭露資訊，故意不開放後台改）。
          </p>
        </section>

        {/* ───────── 客戶評價 ───────── */}
        <section className="appointment content-block">
          <h2 className="content-h">⭐ 客戶評價</h2>
          <SectionSwitch
            section="reviews"
            defaultOn={content.sections.reviews}
            note="首頁「客戶怎麼說」那一區"
          />
          <p className="content-desc">
            ⚠️ 星等與則數<strong>請照 Google 商家後台的實際數字填</strong>，不要估、不要進位。
            這是對外的廣告內容，寫錯就是不實廣告，而且客戶點進 Google 就會發現對不上。
          </p>
          <div className="field-grid content-row">
            <Field label="Google 評分" hint="例如 5.0，最多一位小數" full={false}>
              <input name="reviewsRating" defaultValue={content.reviewsRating} placeholder="5.0" maxLength={3} />
            </Field>
            <Field label="評論則數" hint="例如 80，只填數字" full={false}>
              <input name="reviewsCount" defaultValue={content.reviewsCount} placeholder="80" inputMode="numeric" maxLength={5} />
            </Field>
          </div>
          <div className="field-grid">
            <Field label="Google 評論頁連結" hint="客戶按「在 Google 看全部」會去的地方。要 https:// 開頭">
              <input name="reviewsUrl" defaultValue={content.reviewsUrl} placeholder="https://g.page/r/..." maxLength={400} />
            </Field>
          </div>

          <h3 className="content-h3">挑幾則放在網站上</h3>
          <p className="content-desc">
            照抄 Google 上真實的那幾則就好。<strong>不要自己寫、也不要幫客戶潤飾</strong>——
            兩邊對不起來，比沒有評價還傷。
          </p>
          <RepeatBlock count={reviews} max={MAX_REVIEWS} onAdd={() => setReviews((n) => n + 1)} addLabel="＋ 再加一則評價">
            {(index) => (
              <>
                <div className="field-grid content-row">
                  <Field label="客戶稱呼" hint="例：陳先生（不要放全名）" full={false}>
                    <input name={`reviewName${index}`} defaultValue={content.reviews[index]?.name || ""} maxLength={40} />
                  </Field>
                  <Field label="來源／時間" hint="例：Google 評論・2026.05" full={false}>
                    <input name={`reviewSource${index}`} defaultValue={content.reviews[index]?.source || ""} maxLength={60} />
                  </Field>
                </div>
                <div className="field-grid">
                  <Field label="評價內容">
                    <textarea name={`reviewText${index}`} defaultValue={content.reviews[index]?.text || ""} rows={3} maxLength={400} />
                  </Field>
                </div>
              </>
            )}
          </RepeatBlock>
        </section>

        {/* ───────── 媒體報導 ───────── */}
        <section className="appointment content-block">
          <h2 className="content-h">📰 媒體報導</h2>
          <SectionSwitch
            section="media"
            defaultOn={content.sections.media}
            note="首頁深色的「媒體報導」那一區"
          />
          <p className="content-desc">
            ⚠️ 每一則都<strong>必須附得上原文連結</strong>，客戶點得開才算數。
            沒有連結的、或只是粉專轉貼的，不要放進來。
          </p>
          <div className="field-grid">
            <Field label="引言（報導區最下面那一句）" hint="可留空。例：「寧可實話實說，生意才能做得長久。」">
              <textarea name="mediaQuote" defaultValue={content.mediaQuote} rows={2} maxLength={200} />
            </Field>
          </div>
          <RepeatBlock count={media} max={MAX_MEDIA} onAdd={() => setMedia((n) => n + 1)} addLabel="＋ 再加一則報導">
            {(index) => (
              <>
                <div className="field-grid content-row">
                  <Field label="媒體名稱" hint="例：自由時報" full={false}>
                    <input name={`mediaOutlet${index}`} defaultValue={content.mediaItems[index]?.outlet || ""} maxLength={40} />
                  </Field>
                  <Field label="日期" hint="例：2026.05（可留空）" full={false}>
                    <input name={`mediaDate${index}`} defaultValue={content.mediaItems[index]?.date || ""} maxLength={30} />
                  </Field>
                </div>
                <div className="field-grid">
                  <Field label="報導標題">
                    <input name={`mediaTitle${index}`} defaultValue={content.mediaItems[index]?.title || ""} maxLength={120} />
                  </Field>
                  <Field label="原文連結" hint="https:// 開頭的完整網址（站內頁面可填 /blog/…）">
                    <input name={`mediaUrl${index}`} defaultValue={content.mediaItems[index]?.url || ""} maxLength={400} />
                  </Field>
                </div>
              </>
            )}
          </RepeatBlock>
        </section>

        {/* ───────── 房產知識 ───────── */}
        <section className="appointment content-block">
          <h2 className="content-h">📚 房產知識</h2>
          <SectionSwitch
            section="articles"
            defaultOn={content.sections.articles}
            note="首頁「房產知識・白話拆給你聽」那一區"
          />
          <p className="content-desc">
            文章可以放在<strong>任何地方</strong>——臉書貼文、部落格、Threads 都行，
            這裡只是把連結整理成卡片。之後要在自己網站寫文章，再跟我說，我把整套文章系統加上去。
          </p>
          <RepeatBlock count={articles} max={MAX_ARTICLES} onAdd={() => setArticles((n) => n + 1)} addLabel="＋ 再加一篇文章">
            {(index) => (
              <>
                <div className="field-grid content-row">
                  <Field label="分類" hint="例：房產知識／稅務／新聞時事" full={false}>
                    <input name={`articleCategory${index}`} defaultValue={content.articles[index]?.category || ""} maxLength={20} />
                  </Field>
                  <Field label="連結" hint="https:// 開頭，站內文章可直接填 /blog/…" full={false}>
                    <input name={`articleUrl${index}`} defaultValue={content.articles[index]?.url || ""} maxLength={400} />
                  </Field>
                </div>
                <div className="field-grid">
                  <Field label="標題">
                    <input name={`articleTitle${index}`} defaultValue={content.articles[index]?.title || ""} maxLength={120} />
                  </Field>
                  <Field label="摘要" hint="兩三句，講清楚看完會知道什麼。可留空">
                    <textarea name={`articleExcerpt${index}`} defaultValue={content.articles[index]?.excerpt || ""} rows={2} maxLength={300} />
                  </Field>
                </div>
              </>
            )}
          </RepeatBlock>
        </section>

        {/* ───────── 免費工具 ───────── */}
        <section className="appointment content-block">
          <h2 className="content-h">🧰 免費工具／查詢</h2>
          <SectionSwitch
            section="tools"
            defaultOn={content.sections.tools}
            note="首頁「免費工具／查詢」那一區"
          />
          <p className="content-desc">
            學區地圖、房貸試算、稅費試算這類客戶自己就能用的東西。
            <strong>先上線的可以先放，剩下的等做好再加</strong>——這一區就是為了讓你一個一個補上來。
          </p>
          <RepeatBlock count={tools} max={MAX_TOOLS} onAdd={() => setTools((n) => n + 1)} addLabel="＋ 再加一個工具">
            {(index) => (
              <>
                <div className="field-grid content-row">
                  <Field label="小標籤" hint="例：免費查詢／試算工具" full={false}>
                    <input name={`toolTag${index}`} defaultValue={content.toolItems[index]?.tag || ""} maxLength={20} />
                  </Field>
                  <Field label="連結" hint="https:// 開頭，站內文章可直接填 /blog/…" full={false}>
                    <input name={`toolUrl${index}`} defaultValue={content.toolItems[index]?.url || ""} maxLength={400} />
                  </Field>
                </div>
                <div className="field-grid">
                  <Field label="工具名稱" hint="例：屏東・高雄 學區地圖">
                    <input name={`toolTitle${index}`} defaultValue={content.toolItems[index]?.title || ""} maxLength={60} />
                  </Field>
                  <Field label="一句話說明">
                    <textarea name={`toolDesc${index}`} defaultValue={content.toolItems[index]?.desc || ""} rows={2} maxLength={200} />
                  </Field>
                </div>
              </>
            )}
          </RepeatBlock>
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
          {updatedAt && <span className="content-updated">上次修改：{formatTaipei(updatedAt)}</span>}
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
