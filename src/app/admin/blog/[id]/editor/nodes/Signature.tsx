"use client";

/**
 * signature 的 React NodeView——不可拆的灰色占位卡。
 *
 * 🔴 節點不存署名文字：實文從 `@/lib/agency` 的 ARTICLE_SIGNATURE import 進來
 *    **只顯示、不存、不重打**（法遵字串唯一來源；重打的那一份不會有人幫你檢查
 *    有沒有打錯字）。agency.ts 只 import 純資料檔 profile.ts，client 端可安全引用。
 * 過渡節點：第三段署名列搬進文章頁版型後，這個節點與這張卡一起退場。
 * 可選取、可整塊刪（零鎖；刪了發布檢查會列「文末不會有署名列」，只列不擋）。
 */
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { ARTICLE_SIGNATURE } from "@/lib/agency";

export default function SignatureView(props: NodeViewProps) {
  return (
    <NodeViewWrapper className="bae-placeholder" contentEditable={false}>
      <div className="bae-placeholder-head">
        <span>✍️ 文末署名列（全站統一，程式輸出）</span>
        <button
          type="button"
          className="bae-linkbtn bae-danger"
          onClick={props.deleteNode}
          title="刪掉署名列區塊（第三段搬進版型前，署名還是靠這塊輸出；發布檢查會提醒，不會擋）"
        >
          刪除
        </button>
      </div>
      <p className="bae-placeholder-text">{ARTICLE_SIGNATURE}</p>
      <p className="bae-hint">
        這行字不在文章裡、不用編輯——由程式從法遵字串唯一來源輸出。第三段會搬進版型，屆時這張卡自動消失。
      </p>
    </NodeViewWrapper>
  );
}
