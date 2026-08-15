/**
 * 麵包屑 `.bl-crumb`（規格書 §3.5、INTERFACE §3.4）。
 *
 * 四層：首頁 › 屏東房產研究室 › 分類 › 本篇標題。
 * （設計來源站可見只有三層、JSON-LD 卻是四層，兩邊對不起來是它的 bug，書亞版修掉。）
 *
 * 🔴 三個不能改的細節：
 *   ① 分隔符是 U+203A「›」，**前後各一個半形空格**——不是「>」也不是全形「＞」。
 *   ② 最後一層（本篇標題）是**純文字不做連結**，因為那就是當前頁。
 *   ③ 四層的字必須與 `buildBreadcrumbLd()` 逐字對齊。這裡的第二、三層都從
 *      `BLOG_META.name` 與 `CategoryMeta.name` 取，和 JSON-LD 同源，所以天然一致——
 *      **不要有人為了排版好看就在這裡改字**。
 *
 * 連結刻意用原生 `<a>` 不用 `next/link`：規格要求部落格零 JavaScript、DOM 100% 照抄。
 */
import { BLOG_META, BLOG_URL, categoryUrl, type CategoryMeta } from "@/lib/blog";

export type BlCrumbProps = {
  /** 有給就出現第三層（分類）。列表頁不用給。 */
  category?: CategoryMeta;
  /** 有給就出現第四層（本篇標題，純文字不是連結）。 */
  title?: string;
};

/** 層級分隔符：U+203A，前後各一個半形空格。🔴 不要改成「>」。 */
const SEP = " › ";

export default function BlCrumb({ category, title }: BlCrumbProps) {
  return (
    <nav className="bl-crumb">
      <a href="/">首頁</a>
      {SEP}
      <a href={BLOG_URL}>{BLOG_META.name}</a>
      {category ? (
        <>
          {SEP}
          <a href={categoryUrl(category)}>{category.name}</a>
        </>
      ) : null}
      {title ? (
        <>
          {SEP}
          {title}
        </>
      ) : null}
    </nav>
  );
}
