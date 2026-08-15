import type { Metadata } from "next";
import SiteHome from "@/app/_components/SiteHome";
import { PROFILE } from "@/lib/profile";
import { SITE_URL } from "@/lib/site";
import { getContent } from "@/lib/content";
import { plain } from "@/lib/rich";
import "./site.css";

/**
 * 搜尋結果那兩行字改成從後台讀。
 *
 * ⚠️ 用 generateMetadata 而不是靜態的 metadata：靜態的在編譯時就定死了，
 * 後台改完要重新部署才會生效 —— 而「改了沒反應」是最容易讓人放棄用後台的原因。
 */
export async function generateMetadata(): Promise<Metadata> {
  const content = await getContent();
  const title = plain(content.seoTitle);
  const description = plain(content.seoDescription);
  return { ...BASE_METADATA, title, description };
}

const BASE_METADATA: Metadata = {
  keywords: [
    "屏東房仲推薦", "屏東不動產諮詢", "資產配置規劃", "屏東房仲", "屏東房地產",
    "屏東市房屋買賣", "屏東買房", "屏東賣房", "陳書亞", "書亞屏東房產",
    "屏東節稅諮詢", "屏東房地合一稅", "有巢氏房屋屏東", "高雄房仲", "屏東房產顧問"
  ],
  authors: [{ name: PROFILE.name }],
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  openGraph: {
    type: "profile",
    locale: "zh_TW",
    siteName: "書亞｜屏東房產",
    title: "屏東房仲推薦｜陳書亞 房產顧問・專營屏東市",
    description: "深耕屏東，為你精準佈局每一份資產。連續兩年百萬戰將，提供不動產買賣、資產配置規劃、節稅諮詢與售前簡易裝潢。",
    url: "/",
    /**
     * 🔴 分享圖一定要用 **1200×630** 的 `og-home.png`，不可以指回形象照。
     *
     * 形象照 `shuya-profile.jpg` 是 1044×1568 的**直式**照片，而 LINE 與 Facebook
     * 的預覽卡是 1.91:1 的橫式 —— 直式圖丟進去會被置中裁切，而那張照片的臉在
     * 畫面上方約 40%，裁完臉會落在框外，客戶看到的只剩一塊西裝。
     * 「把首頁網址貼進 LINE 傳給客戶」是書亞最常做的推廣動作，這張圖等於他的名片。
     *
     * `og-home.png` 由 `scripts/build-og-home.mjs` 產生（`npm run og`），
     * 圖上的姓名、職稱、證號、電話、加盟店名全部從原始碼抽出來，不是手打的。
     * 換照片或改電話之後要重跑那支腳本，不然圖上還是舊的。
     *
     * width / height 一定要標：平台拿它決定要不要用大卡版型，沒標的話有些
     * 客戶端會退成小方圖縮圖。
     */
    images: [
      {
        url: "/img/og-home.png",
        width: 1200,
        height: 630,
        alt: `書亞｜屏東房產－${PROFILE.name}，${PROFILE.phone}`
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    title: "屏東房仲推薦｜陳書亞 房產顧問・專營屏東市",
    description: "深耕屏東，為你精準佈局每一份資產。連續兩年百萬戰將，資產配置、節稅諮詢一次到位。",
    // 不指定的話會沿用 og:image；明寫是為了改 og 的時候不會忘了這一邊
    images: ["/img/og-home.png"]
  }
};

const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Person",
      "@id": `${SITE_URL}/#shuya`,
      name: PROFILE.name,
      alternateName: ["書亞", "Shuya"],
      jobTitle: "不動產營業員／房產顧問",
      description: "專營屏東市的房產顧問，提供不動產買賣仲介、資產配置規劃、節稅諮詢與售前簡易裝潢，服務範圍涵蓋屏東與高雄。",
      image: `${SITE_URL}/img/shuya-profile.jpg`,
      telephone: "+886-925-069-812",
      email: PROFILE.email,
      url: `${SITE_URL}/`,
      worksFor: { "@id": `${SITE_URL}/#agency` },
      knowsAbout: [
        "不動產買賣仲介", "不動產資產配置規劃", "房地合一稅",
        "土地增值稅", "自用住宅優惠稅率", "售前簡易裝潢"
      ],
      award: ["114年度百萬戰將", "115年度百萬戰將"]
    },
    {
      "@type": "RealEstateAgent",
      "@id": `${SITE_URL}/#agency`,
      name: "書亞｜屏東房產（有巢氏房屋 屏東崇大華盛加盟店）",
      slogan: "深耕屏東，為你精準佈局每一份資產",
      description: "屏東房仲推薦－陳書亞，連續兩年百萬戰將，專營屏東市的全方位房產顧問服務，提供不動產買賣仲介、資產配置規劃、節稅諮詢與售前簡易裝潢，服務範圍涵蓋屏東縣與高雄。",
      image: `${SITE_URL}/img/shuya-profile.jpg`,
      url: `${SITE_URL}/`,
      telephone: "+886-925-069-812",
      email: PROFILE.email,
      priceRange: "$$",
      employee: { "@id": `${SITE_URL}/#shuya` },
      address: {
        "@type": "PostalAddress",
        addressCountry: "TW",
        addressRegion: "屏東縣",
        addressLocality: "屏東市",
        streetAddress: "華盛街 5-5 號"
      },
      areaServed: [
        { "@type": "City", name: "屏東市" },
        { "@type": "AdministrativeArea", name: "屏東縣" },
        { "@type": "City", name: "高雄市" }
      ],
      hasOfferCatalog: {
        "@type": "OfferCatalog",
        name: "全方位房產顧問服務",
        itemListElement: [
          { "@type": "Offer", itemOffered: { "@type": "Service", name: "不動產買賣仲介", description: "委託銷售、帶看安排、議價協調、簽約與過戶全程陪同。" } },
          { "@type": "Offer", itemOffered: { "@type": "Service", name: "資產配置規劃", description: "依自備款、貸款能力與持有目的，比較自住、置產、收租的現金流與長期增值潛力。" } },
          { "@type": "Offer", itemOffered: { "@type": "Service", name: "稅務諮詢", description: "房地合一稅、土增稅、自用住宅優惠稅率試算與合法節稅空間評估。" } },
          { "@type": "Offer", itemOffered: { "@type": "Service", name: "簡易裝潢", description: "售前屋況檢視、基礎修繕與空間優化，並評估裝修預算的回收效益。" } }
        ]
      }
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: `${SITE_URL}/`,
      name: "書亞｜屏東房產",
      inLanguage: "zh-Hant-TW",
      publisher: { "@id": `${SITE_URL}/#agency` }
    }
  ]
};

/**
 * 每次進頁都重讀文案，後台改完重新整理就看得到。
 *
 * 這頁本來是靜態產生的（編譯時就固定），改成動態之後多花的成本是
 * 每次請求多一趟資料庫查詢（同一個機房，通常幾十毫秒）。
 * 換到的是「改完馬上生效」—— 對一個要自己維護內容的人來說，這個交換絕對划算。
 */
export const dynamic = "force-dynamic";

export default async function Page() {
  const content = await getContent();
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
      />
      <SiteHome content={content} />
    </>
  );
}
