"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { PROFILE } from "@/lib/profile";
import { AGENCY, LEGAL } from "@/lib/agency";
import { visibleSections, type SiteContent } from "@/lib/content";
import { rich, richHeading } from "@/lib/rich";

/**
 * 桌機導覽最多放這麼多項。
 * 可開關的區塊全部打開會變成 10 項，塞不下 —— 硬塞會擠掉 CTA 按鈕或換行讓頁首跳高。
 * 超過的部分只出現在手機選單裡（手機是直的，放幾項都沒差）。
 */
const DESKTOP_NAV_MAX = 7;

/**
 * 門市在 Google 地圖上的位置。
 * 用 search 語法帶店名＋地址，不寫死 place_id ——
 * 商家資料被 Google 換過 id 的話，寫死的連結會變成一片空白，search 至少還找得到。
 */
const MAPS_URL =
  "https://www.google.com/maps/search/?api=1&query=" +
  encodeURIComponent(`有巢氏房屋 屏東崇大華盛加盟店 ${PROFILE.address}`);

/**
 * 後台填的連結是不是站內路徑。
 *
 * 🔴 `//example.com` 要判成**外部**：它開頭雖然是斜線，瀏覽器卻會當成外部網址連出去。
 * 判成站內的話會丟給 <Link>，Next 會試著用路由去找一個不存在的頁面。
 * 這條規則跟 admin/content/actions.ts 的 badUrl() 是同一套，改一邊要記得改另一邊。
 */
const isInternal = (url: string) => /^\/(?!\/)/.test(url);

/**
 * 這些路徑看起來是站內的，但**不是這個 Next app 的路由** ——
 * 是 `next.config.ts` 的 rewrite 轉到另一個 Vercel 專案
 * （目前只有學區地圖 `/tools/school-map`，那包帶著 5.5MB 村里界圖資，沒有塞進主站）。
 *
 * 🔴 這種路徑一定要用普通的 `<a>`，不可以用 `next/link`：
 *    Link 會去 prefetch 這個路由的 RSC payload，可是那個網址回的是**另一個 app 的 HTML**，
 *    輕則 console 一直噴錯，重則點下去卡住不動 —— 而且首頁其他連結都正常，很難聯想。
 *    用 `<a>` 走一般的整頁導覽，rewrite 才會正確生效。
 */
const REWRITTEN_PREFIXES = ["/tools/"];
const isRewritten = (url: string) => REWRITTEN_PREFIXES.some((prefix) => url.startsWith(prefix));

function PhoneIcon({ className = "ico" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path fill="currentColor" d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.2.4 2.4.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.4 0 .7-.2 1l-2.3 2.2Z" />
    </svg>
  );
}

function LineIcon({ className = "ico" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path fill="currentColor" d="M12 2C6.5 2 2 5.7 2 10.2c0 4 3.6 7.4 8.4 8.1.33.07.78.22.9.5.1.26.07.66.03.92l-.14.87c-.05.26-.2 1.02.9.56 1.1-.46 5.9-3.48 8.05-5.95C21.5 13.6 22 12 22 10.2 22 5.7 17.5 2 12 2Z" />
    </svg>
  );
}

function MapPinIcon({ className = "ico" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path fill="currentColor" d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z" />
    </svg>
  );
}

function CardIcon({ className = "ico" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path fill="currentColor" d="M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm2 3v2h5V8H6Zm0 4v2h8v-2H6Z" />
    </svg>
  );
}

function CalendarIcon({ className = "ico" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path fill="currentColor" d="M7 2v2h10V2h2v2h2a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h2V2h2ZM4 9v10h16V9H4Zm3 2h4v4H7v-4Z" />
    </svg>
  );
}

/** 1~10 的中文數字。超過就直接印阿拉伯數字（「連續 11 年」讀起來也通） */
const ZH_NUMBERS = ["", "一", "兩", "三", "四", "五", "六", "七", "八", "九", "十"];

/**
 * 「先確認這四件事」四張卡。
 *
 * 🔴 這四張**只放查得到、可驗證的事實**：得獎紀錄、營業員證號、加盟店名與門市地址、服務區域。
 * 不放成交件數、滿意度、客戶數 —— 那些沒有來源，寫上去就是不實廣告。
 * 證號與店名一律讀 PROFILE，不在這裡重打一次（打錯了畫面上看起來完全正常）。
 */
const WHY_ICONS = {
  award: "M7 4h10v2h3v3a4 4 0 0 1-4 4h-.6A5 5 0 0 1 13 15.9V18h3.5v2h-9v-2H11v-2.1A5 5 0 0 1 7.6 13H7a4 4 0 0 1-4-4V6h4V4Zm0 4H5v1a2 2 0 0 0 2 2V8Zm10 0v3a2 2 0 0 0 2-2V8h-2Z",
  id: "M3 5h18a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm5 3.5A2.25 2.25 0 1 0 8 13a2.25 2.25 0 0 0 0-4.5ZM4.5 17h7c0-1.9-1.6-3-3.5-3s-3.5 1.1-3.5 3Zm9.5-7.5h5.5v1.6H14V9.5Zm0 3.4h5.5v1.6H14v-1.6Z",
  store: "M4 3h16l1.6 5.2A3.1 3.1 0 0 1 18.6 12a3.1 3.1 0 0 1-2.4-1.1A3.1 3.1 0 0 1 13.8 12a3.1 3.1 0 0 1-2.4-1.1A3.1 3.1 0 0 1 9 12a3.1 3.1 0 0 1-2.4-1.1A3.1 3.1 0 0 1 4.2 12a3.1 3.1 0 0 1-1.8-3.8L4 3Zm0 10.7c.9 0 1.7-.3 2.4-.8V21h11.2v-8.1c.7.5 1.5.8 2.4.8V22a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8.3ZM9 15h4v4H9v-4Z",
  pin: "M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z"
} as const;

export default function SiteHome({ content }: { content: SiteContent }) {
  const [navOpen, setNavOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  const tel = `tel:${PROFILE.phoneRaw}`;

  const awardCount = content.awards.length;
  const awardCountZh = ZH_NUMBERS[awardCount] || String(awardCount);
  /**
   * 中間那格大字是獎項本身的名稱。獎名通常長這樣：「年度百萬戰將」，
   * 但那一格上下已經寫了「年度業績肯定」「連續兩年達成」，再帶一次「年度」會很囉唆，
   * 所以開頭的「年度」拿掉。換成別的獎項名稱也照樣運作。
   */
  const awardTitle = (content.awards[awardCount - 1]?.name || "百萬戰將").replace(/^年度/, "");
  const awardYears = content.awards.map((a) => a.year).join("、");

  /** 後台開關 ＋ 有沒有內容，兩個都成立才畫這一區 */
  const show = visibleSections(content);

  /**
   * 導覽。順序＝頁面由上到下的順序，`p` 是「空間不夠時誰先被砍」的優先度（大的留下）。
   *
   * 🔴 「房產知識」指向的是**部落格**（`/blog`）而不是首頁的 `#articles`：文章的家在部落格，
   *    首頁那一區只是帶四張卡的入口。所以它跟 articles 開關無關，**永遠都在**——
   *    （順帶一提：註解裡不要寫「兩個星號緊接斜線」那種字樣，那會提早關掉整段註解。）
   *    部落格四篇是已經上線、Google 收得到的內容，首頁沒有入口等於客戶找不到。
   * 🔴 優先度不是隨便給的：`p` 會變成 `data-p`，CSS 在窄螢幕照這個值一階一階往下砍
   *    （見 site.css 的導覽收斂那段）。若照 DOM 順序砍，最右邊的「房產知識」會第一個消失。
   *    「預約諮詢」給最低分是因為它旁邊就有一顆橘色 CTA 按鈕，砍掉不影響客戶預約。
   */
  const navItems = [
    { href: "#why", label: "為什麼找我", on: show.why, p: 8 },
    { href: "#philosophy", label: "服務理念", on: true, p: 3 },
    { href: "#areas", label: "服務區域", on: true, p: 6 },
    { href: "#record", label: "我的戰績", on: true, p: 4 },
    { href: "#reviews", label: "客戶評價", on: show.reviews, p: 7 },
    { href: "#media", label: "媒體報導", on: show.media, p: 5 },
    { href: "#services", label: "服務項目", on: true, p: 9 },
    { href: "/blog", label: "房產知識", on: true, p: 10, route: true },
    { href: "#tools", label: "免費工具", on: show.tools, p: 7 },
    { href: "#booking", label: "預約諮詢", on: true, p: 2 }
  ].filter((item) => item.on);

  /** 桌機只留優先度最高的幾項，但**照原本的頁面順序排**（不是照優先度排，那樣讀起來會跳） */
  const keep = new Set(
    [...navItems].sort((a, b) => b.p - a.p).slice(0, DESKTOP_NAV_MAX).map((item) => item.href)
  );
  const desktopNav = navItems.filter((item) => keep.has(item.href));

  /** 錨點用 <a>，站內路由用 <Link>（用 <a> 會整頁重載，Next 的預先載入也失效） */
  const navLink = (item: (typeof navItems)[number], onClick?: () => void) =>
    item.route ? (
      <Link key={item.href} href={item.href} data-p={item.p} onClick={onClick}>{item.label}</Link>
    ) : (
      <a key={item.href} href={item.href} data-p={item.p} onClick={onClick}>{item.label}</a>
    );

  const whyCards = [
    {
      icon: WHY_ICONS.award,
      tag: "業績肯定",
      title: `連續${awardCountZh}年${awardTitle}`,
      body: `${awardYears} 年度都達標。定價與議價靠的是每次重新算過一遍的方法，不是某一件特別大的案子。`
    },
    {
      icon: WHY_ICONS.id,
      tag: "合法身分",
      title: "營業員證號公開揭露",
      body: `不動產營業員證號 ${PROFILE.licenseNo}。委託、廣告與簽約全部走正式程序，我是仲介這件事，一開始就會講清楚。`
    },
    {
      icon: WHY_ICONS.store,
      tag: "有實體店頭",
      title: "有巢氏房屋 屏東崇大華盛加盟店",
      body: `門市就在${PROFILE.address}。人找得到、事有人扛，不是一支手機跑全場。`
    },
    {
      icon: WHY_ICONS.pin,
      tag: "在地深耕",
      title: "專營屏東市，服務屏東縣與高雄",
      body: "同一條路的兩側、同一個社區的不同棟，成交價可能差一段。這種價差的原因，實價登錄查不到。"
    }
  ];

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!("IntersectionObserver" in window)) return;
    const targets = Array.from(
      document.querySelectorAll<HTMLElement>(
        ".why-card, .phil-card, .phil-quote, .area-card, .s-stat, .award, .record-lead, .meaning, " +
          ".review-card, .media-card, .article-card, .tool-card, " +
          ".service-card, .checkup, .way, .contact-card"
      )
    );
    targets.forEach((el, i) => {
      el.classList.add("reveal");
      el.style.transitionDelay = `${(i % 4) * 70}ms`;
    });
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("in");
          io.unobserve(entry.target);
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    targets.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <div className="shuya-site">
      <a className="skip-link" href="#main">跳至主要內容</a>

      {/* ========== 頂端資訊條 ========== */}
      {/* 不做 sticky：捲下去就讓它走，黏著的只留頁首那一條，手機才不會被兩層擠掉半個畫面 */}
      <div className="utility-bar">
        <div className="wrap utility-inner">
          <a className="u-phone" href={tel}>
            <PhoneIcon className="u-ico" />
            {PROFILE.phone}
          </a>
          <span className="u-sep" aria-hidden="true">｜</span>
          <span className="u-tag">屏東房產大小事，書亞幫你處理</span>

          <div className="u-links">
            <span className="u-links-label">聯絡 · 預約書亞</span>
            <a
              className="u-dot u-dot-line"
              href={PROFILE.social.line}
              target="_blank"
              rel="noreferrer"
              aria-label={`加 LINE ${PROFILE.social.lineId}`}
              title={`加 LINE ${PROFILE.social.lineId}`}
            >
              <LineIcon className="u-ico" />
            </a>
            <a
              className="u-dot"
              href={MAPS_URL}
              target="_blank"
              rel="noreferrer"
              aria-label="在 Google 地圖上看門市位置"
              title="門市位置"
            >
              <MapPinIcon className="u-ico" />
            </a>
            {/* u-dot-card：最窄的手機放不下五顆，CSS 會把這一顆收起來（名片在漢堡選單裡還有） */}
            <Link className="u-dot u-dot-card" href="/card" aria-label="電子名片" title="電子名片">
              <CardIcon className="u-ico" />
            </Link>
            <Link
              className="u-dot u-dot-cta"
              href="/card/booking"
              aria-label="線上預約"
              title="線上預約"
            >
              <CalendarIcon className="u-ico" />
            </Link>
          </div>
        </div>
      </div>

      {/* ========== 頁首 ========== */}
      <header className={`site-header${scrolled ? " scrolled" : ""}`}>
        <div className="wrap header-inner">
          <a className="s-brand" href="#top">
            <span className="s-brand-mark" aria-hidden="true">書</span>
            <span className="brand-text">
              <strong>{PROFILE.name}</strong>
              <small>屏東房產顧問</small>
            </span>
          </a>

          <nav className="site-nav" aria-label="主選單">
            {/* 電子名片不放這裡：頂端資訊條已經有它的圖示了，
                桌機導覽再塞一個，1000px 左右會跟 CTA 按鈕擠成一團 */}
            {desktopNav.map((item) => navLink(item))}
          </nav>

          <Link className="btn btn-cta btn-sm header-cta" href="/card/booking">
            免費房產健檢
          </Link>

          <button
            className="nav-toggle"
            aria-expanded={navOpen}
            aria-label={navOpen ? "關閉選單" : "開啟選單"}
            onClick={() => setNavOpen((v) => !v)}
          >
            <span /><span /><span />
          </button>
        </div>

        <nav className={`mobile-nav${navOpen ? " open" : ""}`} aria-label="行動版選單">
          {/* 手機這邊放全部，桌機被 DESKTOP_NAV_MAX 砍掉的項目在這裡還找得到 */}
          {navItems.map((item) => navLink(item, () => setNavOpen(false)))}
          <Link href="/card" onClick={() => setNavOpen(false)}>電子名片</Link>
          <Link className="mobile-nav-cta" href="/card/booking" onClick={() => setNavOpen(false)}>
            線上預約諮詢
          </Link>
        </nav>
      </header>

      <main id="main">

        {/* ========== 1. 形象區 ========== */}
        <section className="hero" id="top">
          <div className="wrap hero-grid">
            <div className="hero-copy">
              <p className="eyebrow">
                <span className="eyebrow-dot" aria-hidden="true" />
                {content.heroEyebrow}
              </p>

              <h1>{richHeading(content.heroHeading)}</h1>

              <p className="hero-tagline">{content.heroTagline}</p>

              <p className="lead">{rich(content.heroLead)}</p>

              <ul className="hero-points">
                {content.heroPoints.map((point, index) => (
                  <li key={index}>
                    <span aria-hidden="true">✓</span> <strong>{point.title}</strong>　{point.body}
                  </li>
                ))}
              </ul>

              <div className="hero-actions">
                <Link className="btn btn-primary" href="/card/booking">線上預約免費諮詢</Link>
                <a className="btn btn-ghost" href={tel}>
                  <PhoneIcon />
                  {PROFILE.phone}
                </a>
              </div>

              <p className="hero-note">{content.heroNote}</p>
            </div>

            <figure className="hero-photo">
              <div className="photo-frame">
                <Image
                  src="/img/shuya-profile.jpg"
                  alt={`屏東房產顧問${PROFILE.name}形象照，身著深灰色西裝`}
                  width={1044}
                  height={1568}
                  priority
                />
              </div>
              {/*
                浮在照片左下角那張卡：得獎年數 ＋ 姓名職稱。
                年數與年度全部從 content.awards 算，明年多一座獎這裡自己會變 ——
                寫死的話，畫面會出現「連續兩年」配三座獎，看起來像在灌水。
              */}
              <figcaption className="photo-badge">
                <span className="pb-num">
                  {awardCount}
                  <span className="pb-unit">年</span>
                </span>
                <span className="pb-body">
                  <strong>連續{awardCountZh}年{awardTitle}</strong>
                  <span className="pb-years">{content.awards.map((a) => a.year).join("・")} 年度</span>
                  <span className="pb-who">{PROFILE.name}・不動產營業員</span>
                </span>
              </figcaption>
            </figure>
          </div>
        </section>

        {/* ========== 2. 信任數字帶 ========== */}
        {/* 每一格都是頁面下方某個區塊的入口，不是純裝飾的數字牆 */}
        <section className="trust-band" aria-label="重點資訊">
          <div className="wrap trust-grid">
            <a className="trust-cell" href="#record">
              <span className="trust-num">{awardCount}<span className="trust-unit">年</span></span>
              <span className="trust-label">連續{awardTitle}</span>
              <span className="trust-desc">{content.awards.map((a) => a.year).join("・")} 年度</span>
            </a>
            <a className="trust-cell" href="#areas">
              <span className="trust-num">3<span className="trust-unit">區</span></span>
              <span className="trust-label">服務範圍</span>
              <span className="trust-desc">屏東市・屏東縣・高雄</span>
            </a>
            <a className="trust-cell" href="#services">
              <span className="trust-num">4<span className="trust-unit">項</span></span>
              <span className="trust-label">全方位服務</span>
              <span className="trust-desc">買賣・配置・稅務・裝潢</span>
            </a>
            <a className="trust-cell trust-cell-cta" href="#booking">
              <span className="trust-num">0<span className="trust-unit">元</span></span>
              <span className="trust-label">免費房產健檢</span>
              <span className="trust-desc">行情・鑑價・貸款・稅費</span>
            </a>
          </div>
        </section>

        {/* ========== 3. 為什麼找我（可在後台關掉） ========== */}
        {show.why && (
        <section className="section why-section" id="why">
          <div className="wrap">
            <header className="section-head">
              <p className="section-en">WHY SHUYA</p>
              <h2>把房子交給我之前，先確認這四件事</h2>
              <p className="section-sub">
                房仲入行門檻低，同一個社區可能有二十個人打電話給你。
                要不要往下談，看這四項就夠 —— 全部<strong>查得到、可以驗證</strong>。
              </p>
            </header>

            <div className="why-grid">
              {whyCards.map((card) => (
                <article className="why-card" key={card.title}>
                  <span className="why-ico" aria-hidden="true">
                    <svg viewBox="0 0 24 24"><path fill="currentColor" d={card.icon} /></svg>
                  </span>
                  <p className="why-tag">{card.tag}</p>
                  <h3>{card.title}</h3>
                  <p className="why-body">{card.body}</p>
                </article>
              ))}
            </div>

            <p className="why-note">
              以上為實際取得的獎項、證號與登記資訊，可自行查證。
            </p>
          </div>
        </section>
        )}

        {/* ========== 4. 服務理念 ========== */}
        <section className="section" id="philosophy">
          <div className="wrap">
            <header className="section-head">
              <p className="section-en">PHILOSOPHY</p>
              <h2>我不只是幫你賣房子</h2>
              <p className="section-sub">
                一般仲介的工作，在「成交」那一刻結束。
                但對你來說，真正的問題往往是成交之後才開始——稅怎麼算、錢怎麼放、下一步該不該進場。
                我把自己定位成<strong>房產顧問</strong>，處理的是整件事，不是單一筆交易。
              </p>
            </header>

            <div className="phil-grid">
              <article className="phil-card">
                <p className="phil-num" aria-hidden="true">01</p>
                <h3>先算清楚，再談成交</h3>
                <p>
                  在開價之前，我會把市場行情、銀行鑑價的可能落點、貸款成數與稅費先算給你看。
                  價格從哪裡來，你要知道理由，而不是聽我說一句「這樣賣得掉」。
                </p>
                <p className="phil-key">行情 ・ 鑑價 ・ 貸款 ・ 稅費 ・ 風險</p>
              </article>

              <article className="phil-card">
                <p className="phil-num" aria-hidden="true">02</p>
                <h3>敢說實話，不為成交附和你</h3>
                <p>
                  屋況有問題我會講，開價偏高我會說，不適合買的物件我會勸你先別出手。
                  短期看起來我少賺一筆，但長期你才會願意把下一次、還有你朋友的那一次，也交給我。
                </p>
                <p className="phil-key">誠實揭露 ・ 風險先講 ・ 不做不實廣告</p>
              </article>

              <article className="phil-card">
                <p className="phil-num" aria-hidden="true">03</p>
                <h3>整條線陪你走完</h3>
                <p>
                  從評估、定價、帶看、議價，到簽約、對保、過戶、交屋，甚至交屋後的修繕整理。
                  你不用自己在仲介、代書、銀行跟工班之間來回問，中間任何一段卡住，打給我就好。
                </p>
                <p className="phil-key">單一窗口 ・ 全程陪同 ・ 售後也在</p>
              </article>
            </div>

            <blockquote className="phil-quote">
              <p>「我要的不是這一次成交，是你下一次買賣還會想到我。」</p>
              <cite>{PROFILE.name}</cite>
            </blockquote>
          </div>
        </section>

        {/* ========== 5. 服務區域 ========== */}
        <section className="section section-soft" id="areas">
          <div className="wrap">
            <header className="section-head">
              <p className="section-en">SERVICE AREA</p>
              <h2>我服務的區域</h2>
              <p className="section-sub">
                在地深耕的價值，不在於跑得比別人多，而在於<strong>看得懂價差背後的原因</strong>。
                同一條路的兩側、同一個社區的不同棟，成交價可能差一段。這種事沒有實價登錄查得到，只有天天在這裡跑的人知道。
              </p>
            </header>

            <div className="area-grid">
              <article className="area-card area-card-main">
                <p className="area-tag">主力・專營</p>
                <h3>屏東市</h3>
                <p>透天、公寓、電梯大樓、店面與土地皆有經手。對各生活圈的行情落差、生活機能與屋況常見問題最熟，定價與議價的判斷也最準。</p>
                <ul className="chip-list">
                  <li>市中心</li><li>屏東火車站周邊</li><li>公館</li><li>崇蘭</li><li>大連路商圈</li><li>屏東大學周邊</li>
                </ul>
              </article>

              <article className="area-card">
                <p className="area-tag">延伸服務</p>
                <h3>屏東縣</h3>
                <p>鄰近屏東市的鄉鎮案件持續承接。農地、透天與自地自建的需求，牽涉到的地目、法規與貸款條件跟市區不同，需要分開評估。</p>
                <ul className="chip-list">
                  <li>九如</li><li>長治</li><li>內埔</li><li>潮州</li><li>高樹</li><li>鹽埔</li>
                </ul>
              </article>

              <article className="area-card">
                <p className="area-tag">跨區服務</p>
                <h3>高雄</h3>
                <p>屏東、高雄兩地的通勤與置產需求本來就互相牽動。跨區比價、換屋時序與資金銜接，可以一起放進來評估。</p>
                <ul className="chip-list">
                  <li>自住換屋</li><li>置產收租</li><li>跨區比價</li>
                </ul>
              </article>
            </div>

            <p className="area-footnote">
              不確定你的物件在不在服務範圍？直接打電話問我。就算不在我的守備範圍，我也會告訴你該找誰、要先注意什麼。
            </p>
          </div>
        </section>

        {/* ========== 6. 我的戰績 ========== */}
        <section className="section section-dark" id="record">
          <div className="wrap">
            <header className="section-head section-head-light">
              <p className="section-en">TRACK RECORD</p>
              <h2>我的戰績</h2>
              <p className="section-sub">{content.recordSub}</p>
            </header>

            {/*
              這三個數字方塊全部從「得獎紀錄」那份清單算出來，不另外存。
              分開存的話，明年多一座獎，這裡會忘記改 ——
              而且畫面上「連續兩年」跟底下列出三座獎會同時存在，看起來像在灌水。
            */}
            <div className="s-stat-grid">
              <div className="s-stat">
                <p className="stat-num">{awardCount}<span className="stat-unit">年</span></p>
                <p className="s-stat-label">連續獲獎</p>
                <p className="stat-desc">{content.awards.map((a) => `${a.year} 年`).join("、")}</p>
              </div>
              <div className="s-stat stat-hero">
                <p className="stat-num stat-num-text">{awardTitle}</p>
                <p className="s-stat-label">年度業績肯定</p>
                <p className="stat-desc">連續{awardCountZh}年達成</p>
              </div>
              <div className="s-stat">
                <p className="stat-num">屏東市</p>
                <p className="s-stat-label">專營區域</p>
                <p className="stat-desc">在地深耕・行情熟</p>
              </div>
            </div>

            <div className="award-band">
              {content.awards.map((award, index) => (
                <div className="award" key={index}>
                  <span className="award-year">{award.year}</span>
                  <span className="award-name">{award.name}</span>
                </div>
              ))}
            </div>

            <div className="record-lead">
              <p>{rich(content.recordLead)}</p>
            </div>

            <div className="meaning-grid">
              <div className="meaning">
                <h3>判斷的穩定度</h3>
                <p>兩年都達標，代表定價與議價的判斷不是靠單次運氣，而是可以重複的方法。</p>
              </div>
              <div className="meaning">
                <h3>客戶的實際託付</h3>
                <p>每一筆成交背後，都是一個家庭關於最大一筆資產的重大決定。這是業績數字換不到的東西。</p>
              </div>
              <div className="meaning">
                <h3>屏東在地實戰</h3>
                <p>業績全部來自屏東與高雄市場，不是把外地經驗直接套用在這裡。</p>
              </div>
            </div>

            <p className="record-note">
              以上為實際獲獎紀錄。房產成交條件受屋況、區位、貸款成數與市場時機影響，過往表現不代表對個別案件的成交或價格保證。
            </p>
          </div>
        </section>

        {/* ========== 7. 客戶評價（可在後台關掉） ========== */}
        {/*
          🔴 星等與則數由後台填，**必須照 Google 商家後台的實際數字**。
          這裡刻意不做 JSON-LD 的 aggregateRating —— 自家網站宣稱自家評分，
          Google 的結構化資料規範把它歸類為 self-serving review，標了反而會被判違規。
          要讓評分出現在搜尋結果，靠的是 Google 商家檔案本身，不是這一頁。
        */}
        {show.reviews && (
        <section className="section section-soft" id="reviews">
          <div className="wrap">
            <header className="section-head">
              <p className="section-en">GOOGLE REVIEWS</p>
              <h2>客戶怎麼說</h2>
              <p className="section-sub">
                下面每一則都在 Google 商家評論頁看得到。
                <strong>那裡我沒辦法自己新增或刪除</strong>，所以那才是最誠實的一頁。
              </p>
            </header>

            <div className="review-layout">
              <aside className="review-score">
                {content.reviewsRating && (
                  <p className="rs-num">
                    {content.reviewsRating}
                    <span className="rs-star" aria-hidden="true">★</span>
                  </p>
                )}
                <p className="rs-label">Google 商家評分</p>
                {content.reviewsCount && <p className="rs-count">{content.reviewsCount} 則真實評論</p>}
                {content.reviewsUrl && (
                  <a className="btn btn-outline btn-sm" href={content.reviewsUrl} target="_blank" rel="noreferrer">
                    在 Google 看全部 →
                  </a>
                )}
              </aside>

              {content.reviews.length > 0 && (
                <div className="review-grid">
                  {content.reviews.map((review, index) => (
                    <article className="review-card" key={index}>
                      <p className="rv-stars" aria-hidden="true">★★★★★</p>
                      <p className="rv-text">「{review.text}」</p>
                      <p className="rv-who">
                        <strong>{review.name}</strong>
                        {review.source && <span>{review.source}</span>}
                      </p>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
        )}

        {/* ========== 8. 媒體報導（可在後台關掉） ========== */}
        {show.media && (
        <section className="section section-dark" id="media">
          <div className="wrap">
            <header className="section-head section-head-light">
              <p className="section-en">MEDIA</p>
              <h2>媒體報導</h2>
              <p className="section-sub">每一則都附原文連結，點開就能自己確認。</p>
            </header>

            <div className="media-grid">
              {content.mediaItems.map((item, index) => (
                <a
                  className="media-card"
                  key={index}
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  <p className="md-outlet">{item.outlet}</p>
                  <h3>{item.title}</h3>
                  <p className="md-date">{item.date}</p>
                </a>
              ))}
            </div>

            {content.mediaQuote && (
              <blockquote className="media-quote">
                <p>{content.mediaQuote}</p>
              </blockquote>
            )}
          </div>
        </section>
        )}

        {/* ========== 9. 服務項目 ========== */}
        <section className="section" id="services">
          <div className="wrap">
            <header className="section-head">
              <p className="section-en">SERVICES</p>
              <h2>全方位房產顧問服務</h2>
              <p className="section-sub">
                從決定要不要賣、賣多少，到節稅、貸款與售前整理，一個窗口處理完。
                你不用自己在仲介、代書、銀行與工班之間來回問，也不用擔心每個人講的版本不一樣。
              </p>
            </header>

            <div className="service-grid">
              <article className="service-card">
                <div className="service-ico" aria-hidden="true">
                  <svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 3 2 10.2h2.5V21h5.2v-5.6h4.6V21h5.2V10.2H22L12 3Z" /></svg>
                </div>
                <p className="service-tag">核心業務</p>
                <h3>不動產買賣仲介</h3>
                <p>
                  定價前先做行情與鑑價評估，不用開高價再慢慢降。從委託、帶看、議價到簽約過戶全程陪同，
                  每一次看屋回饋我都會整理給你，讓你知道市場真正的反應是什麼，而不是只聽到「再等等」。
                </p>
                <ul className="tick-list">
                  <li>市場行情與合理開價分析</li>
                  <li>買方帶看與看屋回饋整理</li>
                  <li>議價策略與底價守線建議</li>
                  <li>簽約、對保、過戶進度追蹤</li>
                </ul>
              </article>

              <article className="service-card">
                <div className="service-ico" aria-hidden="true">
                  <svg viewBox="0 0 24 24"><path fill="currentColor" d="M4 20h4v-8H4v8Zm6 0h4V4h-4v16Zm6 0h4v-12h-4v12Z" /></svg>
                </div>
                <p className="service-tag">長期佈局</p>
                <h3>資產配置規劃</h3>
                <p>
                  買在哪、買什麼、放多久，決定的是十年後的結果，不是這個月的成交。
                  我會依你的自備款、貸款能力與持有目的，把自住、置產、收租三種情境的
                  現金流與<strong>長期增值潛力</strong>攤開比較，再決定要不要出手。
                </p>
                <ul className="tick-list">
                  <li>自備款與貸款成數試算</li>
                  <li>自住／置產／收租情境比較</li>
                  <li>長期增值潛力與區域條件評估</li>
                  <li>持有成本、現金流與空置風險檢視</li>
                  <li>換屋時序與資金銜接規劃</li>
                </ul>
              </article>

              <article className="service-card">
                <div className="service-ico" aria-hidden="true">
                  <svg viewBox="0 0 24 24"><path fill="currentColor" d="M6 2h9l5 5v15H6V2Zm8 1.5V8h4.5L14 3.5ZM8.5 12h7v1.7h-7V12Zm0 3.4h7v1.7h-7v-1.7Z" /></svg>
                </div>
                <p className="service-tag">合法節稅</p>
                <h3>稅務諮詢</h3>
                <p>
                  很多人賣完房子才發現，實拿跟自己想的差了一段。
                  房地合一稅、土地增值稅、契稅與自用住宅優惠的適用條件，
                  我會在你出價或簽約<strong>之前</strong>先算給你看，該合法省下來的就省下來。
                </p>
                <ul className="tick-list">
                  <li>房地合一稅持有年限與稅率試算</li>
                  <li>自用住宅優惠稅率適用條件確認</li>
                  <li>合法節稅空間與出售時機評估</li>
                  <li>賣方實拿／買方總支出完整試算</li>
                  <li>複雜個案協同地政士、會計師確認</li>
                </ul>
              </article>

              <article className="service-card">
                <div className="service-ico" aria-hidden="true">
                  <svg viewBox="0 0 24 24"><path fill="currentColor" d="m20.7 6.3-3-3-1.6 1.6 3 3 1.6-1.6ZM3 17.2V21h3.8L17.9 9.9l-3.8-3.8L3 17.2Z" /></svg>
                </div>
                <p className="service-tag">價值提升</p>
                <h3>簡易裝潢</h3>
                <p>
                  同樣一間房子，整理過跟沒整理過，買方願意出的價格可能差一段。
                  但不是花越多越好——哪些錢花了會回本、哪些純粹是自我感覺良好，
                  我會先幫你分清楚再動工。
                </p>
                <ul className="tick-list">
                  <li>售前屋況檢視與修繕優先順序</li>
                  <li>基礎油漆、水電、衛浴整理</li>
                  <li>採光、動線與空間感優化</li>
                  <li>裝修預算與回收效益評估</li>
                </ul>
              </article>
            </div>

            <p className="service-note">
              稅務、貸款與工程金額均需依個案實際條件、金融機構審核結果與最新法令確認。
              網站內容為一般性專業說明，不構成稅額、貸款成數或工程報價之保證。
            </p>
          </div>
        </section>

        {/* ========== 10. 房產知識（可在後台關掉） ========== */}
        {show.articles && (
        <section className="section section-soft" id="articles">
          <div className="wrap">
            <header className="section-head">
              <p className="section-en">KNOWLEDGE</p>
              <h2>房產知識・白話拆給你聽</h2>
              <p className="section-sub">
                稅、貸款、糾紛、政策。你會遇到的問題，我先寫成一篇讓你自己看得懂。
              </p>
            </header>

            {/*
              站內文章（/blog/…）走 <Link>，不開新分頁 —— 那是自己的網站，
              把客戶丟到新分頁反而讓他更容易關掉。外部連結才 target=_blank。
            */}
            <div className="article-grid">
              {content.articles.map((article, index) => {
                const inner = (
                  <>
                    {article.category && <p className="ar-cat">{article.category}</p>}
                    <h3>{article.title}</h3>
                    {article.excerpt && <p className="ar-excerpt">{article.excerpt}</p>}
                    <span className="ar-more">看全文 →</span>
                  </>
                );
                return isInternal(article.url) ? (
                  <Link className="article-card" key={index} href={article.url}>{inner}</Link>
                ) : (
                  <a className="article-card" key={index} href={article.url} target="_blank" rel="noreferrer">
                    {inner}
                  </a>
                );
              })}

              <Link className="article-card article-more" href="/blog">
                <span className="am-ico" aria-hidden="true">
                  <svg viewBox="0 0 24 24"><path fill="currentColor" d="M4 4h10a3 3 0 0 1 3 3v13H7a3 3 0 0 0-3 3V4Zm3 3.5v1.7h7V7.5H7Zm0 3.6v1.7h7v-1.7H7Zm12-4.1h1a1 1 0 0 1 1 1V21a2 2 0 0 1-2 2H8.7a2 2 0 0 0 1.8-1.2h8.5V7Z" /></svg>
                </span>
                <h3>看全部文章</h3>
                <p className="ar-excerpt">屏東房產研究室：稅、貸款、糾紛、社區實勘，持續更新。</p>
                <span className="ar-more">前往部落格 →</span>
              </Link>
            </div>
          </div>
        </section>
        )}

        {/* ========== 11. 免費工具／查詢（可在後台關掉） ========== */}
        {show.tools && (
        <section className="section" id="tools">
          <div className="wrap">
            <header className="section-head">
              <p className="section-en">FREE TOOLS</p>
              <h2>免費工具／查詢</h2>
              <p className="section-sub">
                不用先加我 LINE，也不用留電話。自己先算、先查，覺得需要人幫忙再找我。
              </p>
            </header>

            <div className="tool-grid">
              {content.toolItems.map((tool, index) => {
                const inner = (
                  <>
                    {tool.tag && <p className="tl-tag">{tool.tag}</p>}
                    <h3>{tool.title}</h3>
                    {tool.desc && <p className="tl-desc">{tool.desc}</p>}
                    <span className="tl-more">開始使用 →</span>
                  </>
                );
                // rewrite 過去的路徑要走普通 <a>（理由見檔案上方 isRewritten 的說明），
                // 但它仍然是站內頁面，所以不開新分頁。
                return isInternal(tool.url) && !isRewritten(tool.url) ? (
                  <Link className="tool-card" key={index} href={tool.url}>{inner}</Link>
                ) : (
                  <a
                    className="tool-card"
                    key={index}
                    href={tool.url}
                    {...(isInternal(tool.url) ? {} : { target: "_blank", rel: "noreferrer" })}
                  >
                    {inner}
                  </a>
                );
              })}
            </div>
          </div>
        </section>
        )}

        {/* ========== 12. 預約諮詢 ========== */}
        <section className="section section-soft" id="booking">
          <div className="wrap">
            <header className="section-head">
              <p className="section-en">FREE CONSULTATION</p>
              <h2>預約你的專屬房產健檢</h2>
              <p className="section-sub">
                不用先決定要不要賣、要不要買。先讓我幫你看一輪，把該知道的講清楚，
                再讓你自己決定下一步。<strong>諮詢完全免費。</strong>
              </p>
            </header>

            <div className="checkup">
              <p className="checkup-title">免費房產健檢，你會拿到這四件事</p>
              <ol className="checkup-list">
                <li><span aria-hidden="true">1</span><strong>行情與合理開價區間</strong>目前市場的實際反應，不是理想值</li>
                <li><span aria-hidden="true">2</span><strong>鑑價與貸款成數評估</strong>銀行可能怎麼看這間房子</li>
                <li><span aria-hidden="true">3</span><strong>稅費試算</strong>賣方實拿／買方總支出，先算清楚</li>
                <li><span aria-hidden="true">4</span><strong>風險提醒與下一步</strong>該先查什麼、什麼時候動最好</li>
              </ol>
              <p className="checkup-note">
                以上為依現有資訊所做的專業評估與推估，實際銀行鑑價、貸款成數與稅額，
                仍以金融機構及稅捐機關核定結果為準。
              </p>
            </div>

            <div className="booking-grid">
              <div className="checkup">
                <p className="checkup-title">兩種方式，挑你方便的</p>
                <div className="booking-ways">
                  <div className="way way-primary">
                    <p className="way-tag">推薦</p>
                    <h3>線上預約・自己挑時段</h3>
                    <p>
                      直接看我開放的時間，選一個你方便的時段送出。
                      可選門市面談、電話聯繫或線上視訊，送出後我會在時段前跟你確認。
                    </p>
                    <Link className="btn btn-primary" href="/card/booking">前往線上預約</Link>
                  </div>

                  <div className="way way-secondary">
                    <p className="way-tag">最快</p>
                    <h3>直接問我</h3>
                    <p>
                      不想填表、只想先問一句就好？
                      打電話或加 LINE 直接說，我看到就回。帶看中沒接到的話我會回撥。
                    </p>
                    <a className="btn btn-line" href={PROFILE.social.line} target="_blank" rel="noreferrer">
                      <LineIcon />
                      加 LINE {PROFILE.social.lineId}
                    </a>
                  </div>
                </div>
              </div>

              <aside className="contact-card">
                <h3>直接聯絡書亞</h3>

                <a className="s-contact-row" href={tel}>
                  <span className="contact-ico" aria-hidden="true"><PhoneIcon className="" /></span>
                  <span className="contact-body">
                    <small>手機（同 LINE）</small>
                    <strong>{PROFILE.phone}</strong>
                  </span>
                </a>

                <a className="s-contact-row" href={PROFILE.social.line} target="_blank" rel="noreferrer">
                  <span className="contact-ico contact-ico-line" aria-hidden="true"><LineIcon className="" /></span>
                  <span className="contact-body">
                    <small>LINE 官方帳號</small>
                    <strong>{PROFILE.social.lineId}</strong>
                  </span>
                </a>

                <Link className="s-contact-row" href="/card">
                  <span className="contact-ico" aria-hidden="true">
                    <svg viewBox="0 0 24 24"><path fill="currentColor" d="M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm2 3v2h5V8H6Zm0 4v2h8v-2H6Z" /></svg>
                  </span>
                  <span className="contact-body">
                    <small>電子名片</small>
                    <strong>掃了就能存進手機</strong>
                  </span>
                </Link>

                <div className="contact-hours">
                  <p><strong>服務據點</strong></p>
                  <p>{PROFILE.address}</p>
                  <p className="muted">帶看中可能無法即時接聽，看到未接來電我都會回撥。</p>
                </div>
              </aside>
            </div>
          </div>
        </section>

      </main>

      {/* ========== 頁尾 ========== */}
      <footer className="site-footer">
        <div className="wrap footer-grid">
          <div className="footer-brand">
            <p className="footer-name">{PROFILE.name}　<span>Shuya</span></p>
            <p className="footer-slogan">{content.footerSlogan}</p>
            <p className="footer-tel"><a href={tel}>{PROFILE.phone}</a>（同 LINE）</p>
          </div>

          {/*
            法遵揭露，逐字取自 @/lib/agency（與部落格頁尾同一份資料，不重打字串）。

            🔴 這裡有**兩個人**，任何一項互換都是不實廣告：
                · 陳書亞 ＝ 不動產**營業員**，證號 PROFILE.licenseNo
                · 陳映璿 ＝ 該店專任不動產**經紀人**，證號 AGENCY.broker.licenseNo
            🔴 2026-08-15 補上「經紀業登記名稱」「不動產經紀人」「營業時間」三行 ——
               在此之前部落格頁尾有、首頁沒有，同一個網站兩套揭露。
          */}
          <div className="footer-legal">
            <p><strong>經紀業名稱：</strong>{LEGAL.agencyLine}</p>
            <p><strong>經紀業登記名稱：</strong>{LEGAL.legalNameLine}</p>
            <p><strong>不動產經紀人：</strong>{LEGAL.brokerLine}</p>
            <p><strong>{AGENCY.jobTitle}：</strong>{`${PROFILE.name}　證號 ${PROFILE.licenseNo}`}</p>
            <p><strong>服務據點：</strong>{PROFILE.address}</p>
            <p><strong>營業時間：</strong>{LEGAL.hoursLine}</p>
            <p><strong>服務區域：</strong>{AGENCY.serviceArea}</p>
            <p className="footer-disclaimer">{LEGAL.disclaimer}</p>
          </div>
        </div>

        <div className="wrap footer-bottom">
          <p>© {new Date().getFullYear()} 書亞｜屏東房產．保留一切權利</p>
          <p><a href="#top">回到頁首 ↑</a></p>
        </div>
      </footer>

      {/* 桌機右側快捷鈕。手機不顯示 —— 那邊已經有置底那一條，兩個一起出現會蓋到內容 */}
      <div className="side-dock" aria-label="快速聯絡">
        <Link className="dock-btn dock-book" href="/card/booking">
          <CalendarIcon className="" />
          <span className="dock-label">線上預約</span>
        </Link>
        <a
          className="dock-btn dock-line"
          href={PROFILE.social.line}
          target="_blank"
          rel="noreferrer"
        >
          <LineIcon className="" />
          <span className="dock-label">LINE 諮詢</span>
        </a>
        <a className="dock-btn dock-tel" href={tel}>
          <PhoneIcon className="" />
          <span className="dock-label">{PROFILE.phone}</span>
        </a>
      </div>

      {/* 手機置底快速聯絡列 */}
      <div className="sticky-bar" aria-label="快速聯絡">
        <a className="sticky-btn sticky-tel" href={tel}>
          <PhoneIcon className="" />
          撥打電話
        </a>
        <Link className="sticky-btn sticky-line" href="/card/booking">
          <LineIcon className="" />
          線上預約
        </Link>
      </div>
    </div>
  );
}
