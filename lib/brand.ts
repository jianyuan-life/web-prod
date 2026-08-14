// ============================================================
// 鑒源 JianYuan — 品牌資產
// ============================================================

import { PUBLIC_CLAIMS } from '@/lib/public-claims'

export const BRAND = {
  name_zh: '鑒源',
  name_en: 'JianYuan',
  full_zh: '鑒源命理',
  full_en: 'JianYuan Destiny',

  // 品牌標語
  tagline: PUBLIC_CLAIMS.methodology.tagline,
  tagline_short: '回到源頭，看清本質',
  tagline_en: PUBLIC_CLAIMS.methodology.taglineEn,

  // 品牌理念（用於 About 頁面、品牌介紹）
  philosophy: [
    '鑑，金之明鏡，照見萬象本來面目。',
    '源，水之根本，追溯一切因果脈絡。',
    '鑒源，是以金之澄明，借水之智慧，回到命格的源頭，看清人生的本質。',
  ],

  // 品牌差異化（用於行銷文案）
  differentiators: [
    PUBLIC_CLAIMS.methodology.summary,
    PUBLIC_CLAIMS.methodology.comparison,
    '智能引擎整合，產出有深度、有溫度的個人化報告',
    PUBLIC_CLAIMS.methodology.limits,
  ],

  // 品牌價值觀
  values: [
    { title: '以據為本', desc: PUBLIC_CLAIMS.methodology.summary },
    { title: '以人為鑒', desc: '命理不是預言術，而是自我認知的鏡子。更了解自己，才能做出更好的選擇，把人生的主導權握在自己手裡。' },
    { title: '以源為歸', desc: '穿越千年的智慧不會過時。我們回到東西方命理的源頭，取其精華，以現代技術重新詮釋古典智慧。' },
  ],

  // 品牌色彩
  colors: {
    gold: '#c9a84c',
    dark: '#0a0e1a',
    cream: '#ffffff',
  },
}
