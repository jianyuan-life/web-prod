#!/usr/bin/env python3
"""v5.10.395 Warm Light Theme v1.1 — fonttools subset placeholder

規格:tasks/spec_ui_warm_light_theme_2026-05-16_v1.md §3.2

目的:placeholder for real subset run。實際 Phase 2 / Phase 6 必跑:
  1. 收集 production 真實使用字集:
     - 從 Supabase 撈 500 份 customer reports 的 content
     - 從 i18n 字串
     - 從首頁、定價、報告示例
     - 古籍引用(《滴天髓》《煙波釣叟歌》《紫微斗數全書》等)
  2. 用 fonttools subset:
     pip install fonttools brotli
     pyftsubset NotoSansTC-Regular.otf \\
       --text-file=production_chars.txt \\
       --flavor=woff2 \\
       --output-file=NotoSansTC-Regular.subset.woff2
  3. 對比實際 .woff2 大小、寫進 spec v2 commit message
  4. 替換 next/font/google 改為 self-host self-subset font(performance gain)

placeholder reasons:
  - 需 production 真實字集樣本(Supabase 連線)
  - 需 self-host fonts dir(目前用 next/font/google CDN)
  - 預期 payload:Noto Sans TC ~150KB / Noto Serif TC ~150KB / Source Han Serif TC ~200KB
    (待實測 vs v0 撒謊的 800KB/300KB)

下一步:
  - Phase 6 命理研究部門出術語對應表 + 白話譯文 ~50 條
  - 然後跑此 script 真實 subset
  - 寫進 v1.2 commit
"""

# Placeholder — 等實際資料齊備再跑
import sys

print("[v5.10.395 Phase 2] fonttools subset placeholder")
print("Real subset run pending:")
print("  1. Supabase production content sample (500 reports)")
print("  2. Self-host fonts dir")
print("  3. 古籍引用字集(命理研究部門)")
print("  4. Phase 6 跑")
print()
print("Expected outputs (待實測):")
print("  - NotoSansTC subset: ~150 KB (v0 claimed 800 KB FAIL)")
print("  - NotoSerifTC subset: ~150 KB")
print("  - SourceHanSerifTC subset: ~200 KB (古籍實際 ~1500 字)")
print()
print("Reference: tasks/spec_ui_warm_light_theme_2026-05-16_v1.md §3.2")
sys.exit(0)
