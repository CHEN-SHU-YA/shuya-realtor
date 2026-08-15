# 書亞｜屏東房產

陳書亞（有巢氏房屋 屏東崇大華盛加盟店）的個人官網 ＋ 電子名片 ＋ 線上預約系統。
Next.js 16 單一專案，官網與預約流程整合在一起。

| 路徑 | 內容 | 對外 |
|---|---|---|
| `/` | 個人官網（形象、理念、區域、戰績、服務、預約） | 公開・已做 SEO |
| `/card` | 電子名片 | 公開 |
| `/card/booking` | 線上預約（選時段、撞號防護、AI 客戶分級） | 公開・不索引 |
| `/admin/appointments` | 預約後台 | **需帳密** |
| `/admin/content` | 網站內容與**區塊開關** | **需帳密** |

> 🔴 **正式站 `www.shuyahouse.com` 跑的就是這一包。**
> 同一層還有一個 `shuya-realtor-site/`，那是更早的純靜態 HTML 版本，**已經停用**，
> 內容跟線上對不上。要改官網一律改這裡。

---

## 首頁區塊開關（`/admin/content`）

首頁有五區可以在後台**單獨決定要不要出現**：為什麼找我、客戶評價、媒體報導、房產知識、免費工具／查詢。
沒做完的先關著，前台完全不出現；內容填完打勾存檔，重新整理就長出來，不用重新部署。

| 區塊 | 預設 | 資料來源 |
|---|---|---|
| 為什麼找我 | **開** | 自動來自得獎紀錄、營業員證號、加盟店名、門市地址，沒有欄位要填 |
| 客戶評價 | 關 | 後台填 Google 星等、則數、評論頁連結，再挑幾則貼上 |
| 媒體報導 | 關 | 後台填媒體名稱、標題、**原文連結**、日期 |
| 房產知識 | 關 | 後台填分類、標題、摘要、連結（文章放哪裡都行，這裡只做卡片） |
| 免費工具／查詢 | 關 | 後台填標籤、名稱、說明、連結 |

兩個刻意的設計，改動前先看：

1. **開關打開還不夠，要真的有內容才會畫**（`visibleSections()`）。
   只看開關的話，勾了卻還沒填東西，前台會多出一塊只有標題的空白。
   後台存檔時會提醒「勾了顯示但還沒有內容」。
2. **導覽列跟著開關動**。關掉的區塊不會出現在選單裡（不然會點到不存在的錨點）。
   桌機最多顯示 7 項（`DESKTOP_NAV_MAX`），超過的只留在手機選單 —— 全開是 10 項，桌機塞不下。

⚠️ 評價的星等與則數**必須照 Google 商家後台的實際數字**。這是對外廣告內容，
而且客戶點進 Google 一秒就會發現對不上。另外首頁**刻意不放 `aggregateRating` 結構化資料**——
自家網站宣稱自家評分屬於 self-serving review，標了會被 Google 判違規。

---

## 本機執行

需要 Node.js 20.9 以上（目前用 24.19.0 LTS）。

```bash
npm ci
npm run dev
```

開 <http://localhost:3000>。開發模式下後台不需要密碼，方便自己用。

其他指令：`npm run check`（型別檢查）、`npm run build`、`npm run verify`（兩者都跑）。

---

## 🔴 部署前必看

### 1. 後台一定要設密碼

`/admin/appointments` 會顯示客戶的**姓名、電話、Email 與需求內容**，是個人資料。
所以 `src/proxy.ts` 加了存取控制：

| 情況 | 行為 |
|---|---|
| 有設 `ADMIN_USER` + `ADMIN_PASS` | 要求輸入帳密才能進 |
| 沒設，本機開發 | 直接放行 |
| **沒設，正式環境** | **整個後台停用（回 503）** |

預設是安全的 —— 忘了設密碼不會變成裸奔，而是後台直接關掉。

到 Vercel 的 Settings → Environment Variables 設定：

```
ADMIN_USER = 你想用的帳號
ADMIN_PASS = 夠長的密碼
```

設完要**重新部署一次**才生效。

### 2. ⚠️ Vercel 上「送出預約」會失敗

這是目前最大的限制，**部署前一定要知道**。

預約資料寫在 `data/appointments.json`，但 **Vercel 的檔案系統是唯讀且不持久的**。
部署後的實際狀況：

- ✅ 官網、名片、預約頁面都正常顯示
- ✅ 可選時段（讀 `data/appointments.seed.json`）
- ❌ **按下送出預約 → 寫入失敗**
- ❌ 後台看不到新預約

要真的能收單，得把儲存換成資料庫。好消息是**只要改一個檔案**：
`src/lib/appointment-store.ts` 裡的 `readAppointments()` 與 `writeAppointments()`，
其餘程式（API、後台、AI 分級、確認信）完全不用動。

可選方案：

| 方案 | 說明 |
|---|---|
| Vercel Postgres / KV | 在你自己的 Vercel 專案裡開，整合最簡單 |
| Supabase | 免費額度大，需另外註冊帳號 |
| 有磁碟的主機（Render、Railway、VPS） | 完全不用改程式，JSON 直接能寫 |

**在資料庫接上之前，官網上的「線上預約」按鈕建議先改成 LINE 導流**，
不然客戶按了送出卻失敗，體驗比沒有還糟。要改的話在
`src/app/_components/SiteHome.tsx` 搜尋 `/card/booking`。

### 3. 網站網址

設 `NEXT_PUBLIC_SITE_URL = https://你的正式網域`，
canonical、Open Graph 圖片、結構化資料與 sitemap 都吃這個值。
沒設會自動用 Vercel 給的網址。

---

## 部署到 Vercel

1. 把這個 repo 推上 GitHub
2. 到 <https://vercel.com> 用 GitHub 帳號登入
3. Add New → Project → 選這個 repo → Deploy（框架會自動偵測為 Next.js，不用改設定）
4. 部署完成後到 Settings → Environment Variables 加上 `ADMIN_USER`、`ADMIN_PASS`、`NEXT_PUBLIC_SITE_URL`
5. Deployments → 最新那筆 → Redeploy，讓環境變數生效

---

## 要改內容的話

| 檔案 | 內容 |
|---|---|
| `src/lib/profile.ts` | 姓名、職稱、標語、電話、Email、地址、LINE |
| `src/lib/booking.ts` | 營業時間、開放天數、需求選項、見面方式 |
| `src/lib/grading.ts` | 客戶分級規則、地區關鍵字 |
| `src/app/_components/SiteHome.tsx` | 官網所有文案 |
| `src/app/site.css` | 官網樣式（`:root` 有色票） |
| `src/app/globals.css` | 名片、預約、後台的樣式與品牌色 |
| `public/img/shuya-profile.jpg` | 官網形象照 |
| `public/card/shuya.jpg` | 名片照片 |
| `data/appointments.seed.json` | 後台示範資料 |

### 品牌色（有巢氏房屋 CIS）

主色 `#005335`、輔色 `#4FAF38`、強調 `#D8261C`、淺底 `#F2F7F3`、邊框 `#D8E7DD`、內文 `#173D30`。

兩份 CSS 各有一組 `:root`：`site.css` 用 `--uch-*`，`globals.css` 沿用教材原本的
`--navy-* / --gold-*` 命名（**名字是藍金，值是綠的**，只換值不改名以免動到數百處引用）。

LINE 綠 `#06C755`、表單錯誤紅、後台客戶溫度標籤刻意保留原色，那是辨識功能不是品牌色。

### CSS 隔離

官網樣式包在 `.shuya-site` 底下，且 `site.css` 只在 `/` 匯入，不會影響名片頁與後台。
兩份 CSS 原本有 8 個同名類別（`brand`、`stat`、`field` 等），官網那邊已加 `s-` 前綴避開。

---

## 還沒做的事

- [x] 營業員證號 (109)368962（在 `src/lib/profile.ts` 的 `licenseNo`）
- [ ] 確認營業時間（目前 `booking.ts` 是週一至五 10:00–18:00，房仲週末通常要開）
- [ ] 接資料庫，讓線上預約真的能收單
- [ ] Google Search Console 提交 sitemap
- [ ] 建立 Google 商家檔案（屏東在地搜尋排名主要來自這裡）
- [ ] 確認信目前只產生本機 HTML 預覽，沒有真的寄出

---

## 來源說明

預約系統的骨架來自一份 Next.js 教學專案。本 repo 已移除該教材的所有課程檔案、
講師個人資料與照片，僅保留程式架構，並全面改寫為陳書亞的內容與有巢氏房屋 CIS。
