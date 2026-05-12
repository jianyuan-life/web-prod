// v5.10.88 — L5 Codex finding W1:8 處 dangerouslySetInnerHTML 統一 sanitize 入口
// 對應:_ab_test/strict_eval_v5_10_78/L5_Codex_v5_10_112.md「customer_note 注入 <img onerror> → 9 個渲染點全中」
// 設計:沿用 SectionExpander 既有 SANITIZE_CONFIG(v5.7.83 起跑通)、抽 lib 給其餘渲染點共用
import DOMPurify from 'isomorphic-dompurify'

const SANITIZE_CONFIG = {
  ALLOWED_TAGS: [
    'p','h1','h2','h3','h4','h5','h6','strong','em','u','s','ul','ol','li',
    'a','br','hr','blockquote','table','thead','tbody','tr','th','td',
    'code','pre','span','div','b','i','sup','sub',
  ],
  ALLOWED_ATTR: ['href','target','rel','class','id','style','colspan','rowspan','align'],
  ALLOW_DATA_ATTR: false,
  FORBID_TAGS: ['script','iframe','object','embed','form','input','button','link','meta','style'],
  FORBID_ATTR: ['onerror','onload','onclick','onmouseover','onfocus','onblur','onsubmit','formaction'],
}

export function safeHtml(html: string): string {
  return DOMPurify.sanitize(html || '', SANITIZE_CONFIG)
}
