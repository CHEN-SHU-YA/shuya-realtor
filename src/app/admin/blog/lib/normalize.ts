/**
 * 存檔前正規化：編輯器的 JSON → 契約形狀的 BlogDocJson（B 計畫第二段，純函式）。
 *
 * ── 為什麼要有這一層（INTERFACE-stage2.md §4.6）──
 *
 * 存進 DB 的永遠是契約形狀，第三段切前台時不用再洗資料：
 * ① 頂層節點名照 `BlogBlockNode` 白名單，白名單外 → ok:false 逐條點名
 *   （出現契約外節點＝程式 bug，不是書亞的錯——schema 層本該擋掉）；
 * ② 剝掉編輯器多出的無害預設 attrs（link 的 class、orderedList 的 start:1、
 *    heading 除 level／id 外的多餘 attr）；
 * ③ link 的 target／rel 收斂成 "_blank" | null／"noopener" | null；
 * ④ heading.level 驗是 2；
 * ⑤ text 節點空字串防呆（ProseMirror 不該產生，出現就 ok:false）。
 *
 * BlogEditForm 存檔前先跑它，ok:false 直接顯示訊息不送 action；
 * action 端再跑一次防禦（契約 §3.1 第 4 條）。
 */
import type { JSONContent } from "@tiptap/core";
import type {
  BlogBlockNode,
  BlogDocJson,
  BlogInline,
  BlogLawSourceRef,
  BlogListItemNode,
  BlogMark,
  BlogParagraphNode,
  BlogSpecRow
} from "@/content/blocks/types";

export type NormalizeResult =
  | { ok: true; doc: BlogDocJson }
  | { ok: false; problems: readonly string[] };

/** 頂層區塊白名單（與 types.ts 的 BlogBlockNode 一一對應；匯入驗形也用它）。 */
export const BLOCK_TYPES = new Set([
  "paragraph",
  "heading",
  "lawQuote",
  "sourceLine",
  "bulletList",
  "orderedList",
  "image",
  "horizontalRule",
  "specTable",
  "tocList",
  "signature",
  "editorNote"
]);

type Problems = string[];

/** 行內 runs：text 節點＋bold/link 兩種 mark，其他一律記問題。 */
function normalizeInline(
  content: readonly JSONContent[] | undefined,
  where: string,
  problems: Problems
): BlogInline[] | undefined {
  if (!content || content.length === 0) return undefined;
  const runs: BlogInline[] = [];
  for (const node of content) {
    if (node.type !== "text" || typeof node.text !== "string") {
      problems.push(`${where}：行內出現契約外節點「${String(node.type)}」（契約只有 text）`);
      continue;
    }
    if (node.text === "") {
      problems.push(`${where}：出現空字串 text 節點——ProseMirror 不該產生，這是程式 bug`);
      continue;
    }
    const marks: BlogMark[] = [];
    for (const mark of node.marks ?? []) {
      if (mark.type === "bold") {
        marks.push({ type: "bold" });
      } else if (mark.type === "link") {
        const attrs = (mark.attrs ?? {}) as Record<string, unknown>;
        const href = typeof attrs.href === "string" ? attrs.href : "";
        if (!href) {
          problems.push(`${where}：link mark 缺 href`);
          continue;
        }
        // ③ target／rel 收斂；link extension 多出的 class 等預設 attr 在這裡剝掉
        marks.push({
          type: "link",
          attrs: {
            href,
            target: attrs.target === "_blank" ? "_blank" : null,
            rel: typeof attrs.rel === "string" && attrs.rel.includes("noopener") ? "noopener" : null
          }
        });
      } else {
        problems.push(`${where}：出現契約外 mark「${mark.type}」（契約只有 bold 與 link）`);
      }
    }
    runs.push(marks.length ? { type: "text", text: node.text, marks } : { type: "text", text: node.text });
  }
  return runs.length ? runs : undefined;
}

function normalizeParagraph(node: JSONContent, where: string, problems: Problems): BlogParagraphNode {
  const content = normalizeInline(node.content, where, problems);
  return content ? { type: "paragraph", content } : { type: "paragraph" };
}

/** lawQuote／sourceLine 的 sources attr（面板存進去的形狀，這裡驗一遍）。 */
function normalizeSources(value: unknown, where: string, problems: Problems): BlogLawSourceRef[] {
  if (!Array.isArray(value)) {
    if (value !== null && value !== undefined) problems.push(`${where}：sources 不是陣列`);
    return [];
  }
  const sources: BlogLawSourceRef[] = [];
  for (const raw of value as Record<string, unknown>[]) {
    const text = typeof raw.text === "string" ? raw.text : "";
    if (raw.kind === "moj" && typeof raw.pcode === "string" && typeof raw.flno === "string") {
      sources.push({ kind: "moj", text, pcode: raw.pcode, flno: raw.flno });
    } else if (raw.kind === "url" && typeof raw.href === "string") {
      sources.push({ kind: "url", text, href: raw.href });
    } else {
      problems.push(`${where}：出處項形狀不對（kind=${String(raw.kind)}）`);
    }
  }
  return sources;
}

function normalizeListItem(node: JSONContent, where: string, problems: Problems): BlogListItemNode {
  const content: BlogListItemNode["content"] = [];
  for (const child of node.content ?? []) {
    if (child.type === "paragraph") content.push(normalizeParagraph(child, where, problems));
    else if (child.type === "bulletList" || child.type === "orderedList") {
      content.push(normalizeList(child, where, problems));
    } else {
      problems.push(`${where}：listItem 出現契約外子節點「${String(child.type)}」`);
    }
  }
  return { type: "listItem", content: content.length ? content : [{ type: "paragraph" }] };
}

function normalizeList(
  node: JSONContent,
  where: string,
  problems: Problems
): Extract<BlogBlockNode, { type: "bulletList" | "orderedList" }> {
  const items = (node.content ?? [])
    .filter((child) => {
      if (child.type === "listItem") return true;
      problems.push(`${where}：清單出現契約外子節點「${String(child.type)}」`);
      return false;
    })
    .map((child) => normalizeListItem(child, where, problems));
  if (node.type === "bulletList") return { type: "bulletList", content: items };
  // ② orderedList 的 start:1 是編輯器預設值，直接拿掉；≠1 才照存
  const start = (node.attrs as { start?: unknown } | undefined)?.start;
  if (typeof start === "number" && start !== 1) {
    return { type: "orderedList", attrs: { start }, content: items };
  }
  return { type: "orderedList", content: items };
}

/** 單一頂層區塊。回 null 表示這一塊有問題（已記進 problems）。 */
function normalizeBlock(node: JSONContent, index: number, problems: Problems): BlogBlockNode | null {
  const where = `第 ${index + 1} 個區塊（${String(node.type)}）`;
  const type = node.type ?? "";
  if (!BLOCK_TYPES.has(type)) {
    problems.push(`${where}：契約外的頂層節點「${type || "(無型別)"}」`);
    return null;
  }
  const attrs = (node.attrs ?? {}) as Record<string, unknown>;
  switch (type) {
    case "paragraph":
      return normalizeParagraph(node, where, problems);
    case "heading": {
      // ④ level 鎖死 2；②多餘 attr（textAlign 之類）剝掉，只留 level＋id
      if (attrs.level !== 2) {
        problems.push(`${where}：heading level 只能是 2（拿到 ${String(attrs.level)}）`);
        return null;
      }
      return {
        type: "heading",
        attrs: { level: 2, id: typeof attrs.id === "string" ? attrs.id : "" },
        content: normalizeInline(node.content, where, problems) ?? []
      };
    }
    case "lawQuote":
      return {
        type: "lawQuote",
        attrs: {
          label: typeof attrs.label === "string" && attrs.label !== "" ? attrs.label : null,
          sources: normalizeSources(attrs.sources, where, problems)
        },
        content: (node.content ?? []).map((child) => {
          if (child.type !== "paragraph") {
            problems.push(`${where}：lawQuote 內出現契約外子節點「${String(child.type)}」`);
            return { type: "paragraph" as const };
          }
          return normalizeParagraph(child, where, problems);
        })
      };
    case "sourceLine":
      return {
        type: "sourceLine",
        attrs: {
          label: typeof attrs.label === "string" ? attrs.label : "",
          sources: normalizeSources(attrs.sources, where, problems)
        }
      };
    case "bulletList":
    case "orderedList":
      return normalizeList(node, where, problems);
    case "image":
      return {
        type: "image",
        attrs: {
          file: typeof attrs.file === "string" ? attrs.file : "",
          alt: typeof attrs.alt === "string" ? attrs.alt : "",
          width: typeof attrs.width === "number" ? attrs.width : 1200,
          height: typeof attrs.height === "number" ? attrs.height : 675,
          loading: attrs.loading === "eager" ? "eager" : "lazy"
        }
      };
    case "horizontalRule":
      return { type: "horizontalRule" };
    case "specTable": {
      const rows: BlogSpecRow[] = [];
      if (Array.isArray(attrs.rows)) {
        for (const raw of attrs.rows as Record<string, unknown>[]) {
          rows.push({
            label: typeof raw.label === "string" ? raw.label : "",
            value: Array.isArray(raw.value) ? ((raw.value as BlogInline[]).filter((r) => r.type === "text" && r.text !== "")) : []
          });
        }
      }
      return {
        type: "specTable",
        attrs: {
          title: typeof attrs.title === "string" ? attrs.title : "",
          badge: typeof attrs.badge === "string" && attrs.badge !== "" ? attrs.badge : null,
          rows,
          tag: Array.isArray(attrs.tag) && (attrs.tag as BlogInline[]).length ? (attrs.tag as BlogInline[]) : null,
          source: typeof attrs.source === "string" ? attrs.source : ""
        }
      };
    }
    case "tocList":
      return { type: "tocList" };
    case "signature":
      return { type: "signature" };
    case "editorNote":
      return { type: "editorNote", attrs: { text: typeof attrs.text === "string" ? attrs.text : "" } };
    default:
      return null; // 不會走到（白名單已擋），保型別完整
  }
}

/**
 * 編輯器 JSON → 契約形狀。ok:false ＝ 出現契約外內容（程式 bug，不是書亞的錯），
 * 呼叫端顯示人話並請他先把內容複製保存。
 */
export function normalizeEditorDoc(editorJson: JSONContent): NormalizeResult {
  const problems: Problems = [];
  if (editorJson.type !== "doc" || !Array.isArray(editorJson.content)) {
    return { ok: false, problems: ["文件根節點不是 doc——編輯器狀態壞了"] };
  }
  const blocks: BlogBlockNode[] = [];
  editorJson.content.forEach((node, index) => {
    const block = normalizeBlock(node, index, problems);
    if (block) blocks.push(block);
  });
  if (problems.length) return { ok: false, problems };
  return { ok: true, doc: { type: "doc", content: blocks } };
}
