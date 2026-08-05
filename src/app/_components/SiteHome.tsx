"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { PROFILE } from "@/lib/profile";

const NAV = [
  { href: "#philosophy", label: "服務理念" },
  { href: "#areas", label: "服務區域" },
  { href: "#record", label: "我的戰績" },
  { href: "#services", label: "服務項目" },
  { href: "#booking", label: "預約諮詢" }
];

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

export default function SiteHome() {
  const [navOpen, setNavOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  const tel = `tel:${PROFILE.phoneRaw}`;

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
        ".phil-card, .phil-quote, .area-card, .s-stat, .award, .record-lead, .meaning, .service-card, .checkup, .way, .contact-card"
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
            {NAV.map((item) => (
              <a key={item.href} href={item.href}>{item.label}</a>
            ))}
            <Link href="/card">電子名片</Link>
          </nav>

          <Link className="btn btn-primary btn-sm header-cta" href="/card/booking">
            線上預約
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
          {NAV.map((item) => (
            <a key={item.href} href={item.href} onClick={() => setNavOpen(false)}>{item.label}</a>
          ))}
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
                114・115 連續兩年百萬戰將　│　有巢氏房屋 屏東崇大華盛加盟店
              </p>

              <h1>
                深耕屏東，<br />
                為你<span className="hl">精準佈局</span>每一份資產
              </h1>

              <p className="hero-tagline">「屏東房產大小事，書亞幫你處理」</p>

              <p className="lead">
                我是<strong>{PROFILE.name}</strong>，專營屏東市的房產顧問，服務範圍涵蓋屏東與高雄。
                房子是多數人一生最大的一筆資產，決定它的價格、貸款方式與持有時間，
                往往比「找到買方」更影響你最後真正拿到多少。
                所以在談成交之前，我會先把數字算清楚，讓你知道自己在做什麼決定。
              </p>

              <ul className="hero-points">
                <li><span aria-hidden="true">✓</span> <strong>連續兩年百萬戰將</strong>　業績肯定來自持續成交，不是單次好運</li>
                <li><span aria-hidden="true">✓</span> <strong>全方位房產顧問</strong>　買賣、資產配置、節稅、售前整理一個窗口</li>
                <li><span aria-hidden="true">✓</span> <strong>數字先講清楚</strong>　行情、鑑價、貸款、稅費攤開再談價格</li>
              </ul>

              <div className="hero-actions">
                <Link className="btn btn-primary" href="/card/booking">線上預約免費諮詢</Link>
                <a className="btn btn-ghost" href={tel}>
                  <PhoneIcon />
                  {PROFILE.phone}
                </a>
              </div>

              <p className="hero-note">電話同 LINE，訊息我看到都會回。諮詢不收費，也不會一直打電話催你。</p>
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
              <figcaption className="photo-badge">
                <strong>{PROFILE.name}</strong>
                <span>不動產營業員・房產顧問</span>
              </figcaption>
            </figure>
          </div>
        </section>

        {/* ========== 2. 服務理念 ========== */}
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

        {/* ========== 3. 服務區域 ========== */}
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

        {/* ========== 4. 我的戰績 ========== */}
        <section className="section section-dark" id="record">
          <div className="wrap">
            <header className="section-head section-head-light">
              <p className="section-en">TRACK RECORD</p>
              <h2>我的戰績</h2>
              <p className="section-sub">連續兩年百萬戰將，代表的不只是業績數字。</p>
            </header>

            <div className="s-stat-grid">
              <div className="s-stat">
                <p className="stat-num">2<span className="stat-unit">年</span></p>
                <p className="s-stat-label">連續獲獎</p>
                <p className="stat-desc">114 年、115 年</p>
              </div>
              <div className="s-stat stat-hero">
                <p className="stat-num stat-num-text">百萬戰將</p>
                <p className="s-stat-label">年度業績肯定</p>
                <p className="stat-desc">連續兩年達成</p>
              </div>
              <div className="s-stat">
                <p className="stat-num">屏東市</p>
                <p className="s-stat-label">專營區域</p>
                <p className="stat-desc">在地深耕・行情熟</p>
              </div>
            </div>

            <div className="award-band">
              <div className="award">
                <span className="award-year">114</span>
                <span className="award-name">年度百萬戰將</span>
              </div>
              <div className="award">
                <span className="award-year">115</span>
                <span className="award-name">年度百萬戰將</span>
              </div>
            </div>

            <div className="record-lead">
              <p>
                百萬戰將是年度業績門檻。能<strong>連續兩年</strong>達成，靠的不是某一件特別大的案子，
                而是每一次定價前都把行情、鑑價與貸款成數重新算過一遍——
                以及一組又一組客戶，願意把手上最大的一筆資產，交到我手上。
              </p>
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

        {/* ========== 5. 服務項目 ========== */}
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

        {/* ========== 6. 預約諮詢 ========== */}
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
            <p className="footer-slogan">深耕屏東，為你精準佈局每一份資產</p>
            <p className="footer-tel"><a href={tel}>{PROFILE.phone}</a>（同 LINE）</p>
          </div>

          <div className="footer-legal">
            <p><strong>經紀業名稱：</strong>有巢氏房屋　屏東崇大華盛加盟店</p>
            <p><strong>不動產營業員：</strong>{PROFILE.name}　證號 {PROFILE.licenseNo}</p>
            <p><strong>服務據點：</strong>{PROFILE.address}</p>
            <p><strong>服務區域：</strong>屏東市（專營）、屏東縣、高雄</p>
            <p className="footer-disclaimer">
              本網站為不動產經紀營業員個人服務介紹，屬仲介服務性質。所載行情、稅務與貸款說明僅供參考，
              實際條件應以各金融機構、稅捐機關及主管機關最新規定與個案審核結果為準。
            </p>
          </div>
        </div>

        <div className="wrap footer-bottom">
          <p>© {new Date().getFullYear()} 書亞｜屏東房產．保留一切權利</p>
          <p><a href="#top">回到頁首 ↑</a></p>
        </div>
      </footer>

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
