import type { Metadata } from "next";
import SiteHome from "@/app/_components/SiteHome";
import { PROFILE } from "@/lib/profile";
import { SITE_URL } from "@/lib/site";
import "./site.css";

const TITLE = "屏東房仲推薦｜陳書亞 房產顧問・專營屏東市｜資產配置規劃・不動產諮詢";
const DESCRIPTION =
  "屏東房仲推薦－陳書亞（書亞），連續兩年百萬戰將，專營屏東市，服務屏東與高雄。提供不動產買賣仲介、資產配置規劃、節稅諮詢與售前簡易裝潢。不只幫你買賣房子，先把行情、鑑價、貸款與稅費算清楚再談成交。免費房產健檢諮詢 0925-069-812（同 LINE）。";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
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
    images: [{ url: "/img/shuya-profile.jpg", alt: `屏東房產顧問${PROFILE.name}形象照` }]
  },
  twitter: {
    card: "summary_large_image",
    title: "屏東房仲推薦｜陳書亞 房產顧問・專營屏東市",
    description: "深耕屏東，為你精準佈局每一份資產。連續兩年百萬戰將，資產配置、節稅諮詢一次到位。"
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

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
      />
      <SiteHome />
    </>
  );
}
