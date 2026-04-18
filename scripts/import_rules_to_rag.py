#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
鑑源 RAG 規則庫匯入腳本
============================================================

掃描命理規則 Markdown 檔，切成「規則單位」，用 Voyage voyage-3-large
做 embedding，然後 INSERT 進 Supabase rules_library。

切分策略：
  - 按 Markdown 標題切（H2 # 為主切點；H3 ### 為次切點）
  - 每段保留主標題路徑，如「八字SOP > 十神體系 > 完整十神對照表」
  - 空段、太短段（< 20 字元）、目錄段（只有連結列表）會跳過
  - 太長段（> 4000 字元）會按段落再次切分

Embedding：
  - Voyage voyage-3-large（1024 維）
  - input_type=document
  - 批次 8 條/次（Voyage 單次上限 128 條、32k tokens）

執行範例：
  python scripts/import_rules_to_rag.py --limit 300 --dry-run
  python scripts/import_rules_to_rag.py --limit 300
  python scripts/import_rules_to_rag.py                  # 全跑
  python scripts/import_rules_to_rag.py --system bazi    # 只跑八字

環境變數（從 ~/.claude/.env 或環境讀取）：
  VOYAGE_API_KEY
  NEXT_PUBLIC_SUPABASE_URL / SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Iterable

import requests

# ============================================================
# 設定
# ============================================================

REPO_ROOT = Path(__file__).resolve().parents[1]             # 網頁製作部門/
WORKSPACE_ROOT = REPO_ROOT.parents[1]                        # Claude專案/

# 規則檔掃描目錄
SCAN_DIRS = [
    WORKSPACE_ROOT / 'Claude-全方位命理系統' / 'references',
    WORKSPACE_ROOT / 'Claude-鑑源' / 'Claude-鑑源命理研究部門',
]

# 檔名 → 系統 mapping（優先比對，沒命中則嘗試推斷）
FILE_SYSTEM_MAP = {
    'bazi':              'bazi',
    'ziwei':             'ziwei',
    'qimen':             'qimen',
    'chumenji':          'qimen',
    'name_numerology':   'name',
    'numerology':        'numerology',
    'fengshui':          'fengshui',
    'tarot':             'tarot',
    'i_ching':           'iching',
    'iching':            'iching',
    'liuyao':            'iching',
    'western_astrology': 'western_astrology',
    'vedic_astrology':   'vedic_astrology',
    'human_design':      'human_design',
    'chinese_zodiac':    'zodiac',
    'chinese_classical': 'classical',
    'biorhythm':         'biorhythm',
    'qizheng':           'classical',
    'zeri':              'classical',
    'shenke':            'qimen',
    'feigong':           'qimen',
    'integration':       'integration',
    'comprehensive':     'integration',
    'report_qa':         'integration',
    'master_level':      'integration',
    'authority':         'integration',
    'calculator_theory': 'integration',
    'south_southeast':   'integration',
    'system_gap':        'integration',
}

VOYAGE_ENDPOINT = 'https://api.voyageai.com/v1/embeddings'
VOYAGE_MODEL = 'voyage-3-large'
EMBEDDING_DIM = 1024
VOYAGE_BATCH_SIZE = 8

MIN_CHUNK_CHARS = 20          # 小於這個字元數的段跳過
MAX_CHUNK_CHARS = 4000        # 大於這個字元數的段會再切
SOFT_CHUNK_CHARS = 1800       # 二次切分目標長度

# ============================================================
# env 讀取
# ============================================================

def load_env_file(path: Path) -> dict[str, str]:
    """簡易 .env parser，支援 KEY=VALUE 和 KEY="VALUE"。"""
    out: dict[str, str] = {}
    if not path.exists():
        return out
    for line in path.read_text(encoding='utf-8', errors='ignore').splitlines():
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        if '=' not in line:
            continue
        key, _, val = line.partition('=')
        key = key.strip()
        val = val.strip().strip('"').strip("'")
        if key:
            out[key] = val
    return out


def get_env(key: str, *fallbacks: str) -> str | None:
    for k in (key, *fallbacks):
        v = os.environ.get(k)
        if v:
            return v
    return None


# 啟動時載入 env：~/.claude/.env（Voyage key）+ 專案 .env.local（Supabase）
_env_sources = [
    Path.home() / '.claude' / '.env',
    REPO_ROOT / '.env.local',
    REPO_ROOT / '.env.prod',
    REPO_ROOT / '.env.production',
    REPO_ROOT / '.env',
]
for _src in _env_sources:
    for k, v in load_env_file(_src).items():
        os.environ.setdefault(k, v)


# ============================================================
# 資料類型
# ============================================================

@dataclass
class RuleChunk:
    system: str
    rule_type: str | None
    title: str
    content: str
    source: str | None
    source_chapter: str | None
    metadata: dict


# ============================================================
# 檔案 → 系統 / 規則類型推斷
# ============================================================

def infer_system(md_path: Path) -> str:
    name = md_path.stem.lower()
    for key, sys in FILE_SYSTEM_MAP.items():
        if key in name:
            return sys
    # fallback: 從檔名第一段
    head = name.split('_', 1)[0]
    return FILE_SYSTEM_MAP.get(head, 'integration')


def infer_source(md_path: Path) -> str:
    """古籍出處：用檔名去掉後綴當作人類可讀的來源。"""
    return md_path.stem.replace('_', ' ')


RULE_TYPE_HINTS = [
    ('shishen',       ['十神', 'shishen']),
    ('dayun',         ['大運', 'dayun']),
    ('geju',          ['格局', 'geju', 'pattern']),
    ('sihua',         ['四化', 'sihua']),
    ('bamen',         ['八門', 'bamen', 'eightdoor']),
    ('jiuxing',       ['九星', 'jiuxing', 'ninestar']),
    ('bashen',        ['八神', 'bashen']),
    ('yongshen',      ['用神', 'yongshen']),
    ('liunian',       ['流年', 'liunian']),
    ('mingpan',       ['命盤', 'mingpan']),
    ('wuxing',        ['五行', 'wuxing']),
    ('shengxiao',     ['生肖', 'shengxiao']),
    ('qa',            ['qa', '審核', '品質', 'quality']),
    ('sop',           ['sop', '流程']),
]


def infer_rule_type(title: str, chapter: str | None) -> str | None:
    hay = f'{title} {chapter or ""}'.lower()
    for rtype, keys in RULE_TYPE_HINTS:
        for k in keys:
            if k in hay:
                return rtype
    return None


# ============================================================
# Markdown 切分
# ============================================================

HEADING_RE = re.compile(r'^(#{1,6})\s+(.+?)\s*$', re.MULTILINE)


def split_markdown(md_text: str, md_path: Path) -> list[RuleChunk]:
    """
    按 Markdown 標題切成 chunk。
    主標題（H1）當作整檔 title；H2 為主切點；H3 為次切點。
    """
    system = infer_system(md_path)
    source = infer_source(md_path)

    lines = md_text.splitlines(keepends=True)

    # 記錄每個 heading 的位置
    headings: list[tuple[int, int, str, int]] = []  # (line_idx, level, text, char_pos)
    char_pos = 0
    for i, line in enumerate(lines):
        m = HEADING_RE.match(line)
        if m:
            level = len(m.group(1))
            title = m.group(2).strip()
            headings.append((i, level, title, char_pos))
        char_pos += len(line)

    if not headings:
        # 沒有標題 → 整檔當一塊
        content = md_text.strip()
        if len(content) < MIN_CHUNK_CHARS:
            return []
        return split_oversized([RuleChunk(
            system=system,
            rule_type=None,
            title=md_path.stem,
            content=content,
            source=source,
            source_chapter=None,
            metadata={'file_path': str(md_path)},
        )])

    # H1 當 doc_title
    doc_title = next((h[2] for h in headings if h[1] == 1), md_path.stem)

    # 用 H2/H3 切（H4 以下留在內文裡）
    cut_points = [h for h in headings if h[1] in (2, 3)]

    chunks: list[RuleChunk] = []

    # 處理第一個 H2 之前的內容（intro）
    first_cut = cut_points[0][0] if cut_points else len(lines)
    intro = ''.join(lines[:first_cut]).strip()
    # 去掉 H1 標題行本身
    intro = re.sub(r'^#\s+.+?\n', '', intro, count=1).strip()
    if len(intro) >= MIN_CHUNK_CHARS:
        chunks.append(RuleChunk(
            system=system,
            rule_type=None,
            title=f'{doc_title} 導言',
            content=intro,
            source=source,
            source_chapter=None,
            metadata={'file_path': str(md_path), 'heading_path': [doc_title]},
        ))

    # 逐段切
    h2_stack: str | None = None
    for idx, (line_idx, level, title, _) in enumerate(cut_points):
        # 找下一個 cut point 當結束
        if idx + 1 < len(cut_points):
            end_line = cut_points[idx + 1][0]
        else:
            end_line = len(lines)

        # 取本段內容（含自己的標題行以下）
        segment = ''.join(lines[line_idx + 1:end_line]).strip()
        if not segment:
            continue

        # 標題路徑
        if level == 2:
            h2_stack = title
            heading_path = [doc_title, title]
            chapter = title
        else:  # level == 3
            heading_path = [doc_title, h2_stack or '', title]
            chapter = f'{h2_stack} > {title}' if h2_stack else title

        # 目錄段過濾（整段幾乎都是連結）
        if is_toc_like(segment):
            continue

        if len(segment) < MIN_CHUNK_CHARS:
            continue

        chunks.append(RuleChunk(
            system=system,
            rule_type=infer_rule_type(title, chapter),
            title=title,
            content=segment,
            source=source,
            source_chapter=chapter,
            metadata={
                'file_path': str(md_path),
                'heading_path': heading_path,
                'heading_level': level,
            },
        ))

    return split_oversized(chunks)


def is_toc_like(text: str) -> bool:
    """判斷是否為目錄段（大量連結、缺乏內容）。"""
    link_count = len(re.findall(r'\[.+?\]\(.+?\)', text))
    bullet_count = len(re.findall(r'^\s*[-*]\s', text, re.MULTILINE))
    total_chars = len(text)
    if total_chars == 0:
        return True
    # 連結密度高且字數不多 → 像目錄
    if link_count >= 5 and total_chars / max(link_count, 1) < 60:
        return True
    # 純 bullet list 且非常短
    if bullet_count >= 3 and total_chars < 200:
        return True
    return False


def split_oversized(chunks: list[RuleChunk]) -> list[RuleChunk]:
    """把過長的 chunk 按段落再切，避免超過 Voyage 單條上限。"""
    out: list[RuleChunk] = []
    for chunk in chunks:
        if len(chunk.content) <= MAX_CHUNK_CHARS:
            out.append(chunk)
            continue

        parts = re.split(r'\n\n+', chunk.content)
        buf: list[str] = []
        buf_len = 0
        part_idx = 1
        for p in parts:
            p = p.strip()
            if not p:
                continue
            if buf_len + len(p) > SOFT_CHUNK_CHARS and buf:
                out.append(_clone_chunk(chunk, '\n\n'.join(buf), part_idx))
                part_idx += 1
                buf = [p]
                buf_len = len(p)
            else:
                buf.append(p)
                buf_len += len(p)
        if buf:
            out.append(_clone_chunk(chunk, '\n\n'.join(buf), part_idx if part_idx > 1 else 0))
    return out


def _clone_chunk(base: RuleChunk, content: str, part_idx: int) -> RuleChunk:
    title = base.title if part_idx == 0 else f'{base.title} (part {part_idx})'
    meta = dict(base.metadata)
    if part_idx > 0:
        meta['part'] = part_idx
    return RuleChunk(
        system=base.system,
        rule_type=base.rule_type,
        title=title,
        content=content,
        source=base.source,
        source_chapter=base.source_chapter,
        metadata=meta,
    )


# ============================================================
# Voyage embedding
# ============================================================

def voyage_embed(texts: list[str], api_key: str) -> list[list[float]]:
    """一次 embed 多條文字，回傳對應的向量。"""
    payload = {
        'model': VOYAGE_MODEL,
        'input': texts,
        'input_type': 'document',
    }
    headers = {
        'Authorization': f'Bearer {api_key}',
        'Content-Type': 'application/json',
    }
    last_err = None
    for attempt in range(3):
        try:
            r = requests.post(VOYAGE_ENDPOINT, json=payload, headers=headers, timeout=60)
            if r.status_code == 429:
                wait = 5 * (attempt + 1)
                print(f'  [voyage] 429 rate limit，等 {wait}s 重試', file=sys.stderr)
                time.sleep(wait)
                continue
            r.raise_for_status()
            data = r.json()['data']
            vectors = [item['embedding'] for item in data]
            for v in vectors:
                if len(v) != EMBEDDING_DIM:
                    raise RuntimeError(f'Voyage 回傳維度錯誤 {len(v)} != {EMBEDDING_DIM}')
            return vectors
        except requests.HTTPError as e:
            body = e.response.text[:500] if e.response is not None else ''
            last_err = f'HTTP {e.response.status_code if e.response else "?"}: {body}'
        except Exception as e:
            last_err = str(e)
        time.sleep(2 * (attempt + 1))
    raise RuntimeError(f'Voyage embed 三次失敗：{last_err}')


# ============================================================
# Supabase REST 插入
# ============================================================

def supabase_insert(rows: list[dict], supabase_url: str, service_key: str) -> int:
    url = f'{supabase_url}/rest/v1/rules_library'
    headers = {
        'apikey': service_key,
        'Authorization': f'Bearer {service_key}',
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
    }
    r = requests.post(url, json=rows, headers=headers, timeout=60)
    if r.status_code not in (200, 201, 204):
        raise RuntimeError(f'Supabase insert 失敗 {r.status_code}: {r.text[:500]}')
    return len(rows)


# ============================================================
# Pipeline
# ============================================================

def iter_rule_files(system_filter: str | None) -> Iterable[Path]:
    for root in SCAN_DIRS:
        if not root.exists():
            continue
        for md in sorted(root.rglob('*.md')):
            # 跳過 _archived
            if '_archived' in md.parts:
                continue
            if system_filter:
                if infer_system(md) != system_filter:
                    continue
            yield md


def chunks_from_files(files: list[Path]) -> list[RuleChunk]:
    all_chunks: list[RuleChunk] = []
    for md in files:
        try:
            text = md.read_text(encoding='utf-8', errors='ignore')
        except Exception as e:
            print(f'  [skip] {md.name}: {e}', file=sys.stderr)
            continue
        chunks = split_markdown(text, md)
        print(f'  [read] {md.relative_to(WORKSPACE_ROOT) if md.is_relative_to(WORKSPACE_ROOT) else md.name}  →  {len(chunks)} chunks')
        all_chunks.extend(chunks)
    return all_chunks


def main() -> int:
    parser = argparse.ArgumentParser(description='鑑源 RAG 規則匯入')
    parser.add_argument('--limit', type=int, default=None, help='限制匯入筆數（測試用）')
    parser.add_argument('--system', type=str, default=None, help='只匯入特定系統（bazi/ziwei/qimen/...）')
    parser.add_argument('--dry-run', action='store_true', help='不做 embedding 和 insert，只輸出切塊結果')
    parser.add_argument('--test-embed', action='store_true', help='只 embed 一條測試，驗證 Voyage 可用')
    args = parser.parse_args()

    voyage_key = get_env('VOYAGE_API_KEY')
    supabase_url = get_env('NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL')
    service_key = get_env('SUPABASE_SERVICE_ROLE_KEY')

    if not voyage_key:
        print('錯誤：VOYAGE_API_KEY 未設定（~/.claude/.env 或環境變數）', file=sys.stderr)
        return 1

    # --test-embed：快速驗證 Voyage 金鑰可用、維度正確
    if args.test_embed:
        print('[test-embed] 發一條測試到 Voyage voyage-3-large...')
        vec = voyage_embed(['甲木日主見庚金為七殺，身強喜剋洩，身弱忌官殺攻身。'], voyage_key)[0]
        print(f'  [OK] 維度 = {len(vec)}')
        print(f'  [preview] 前 8 維 = {vec[:8]}')
        return 0

    # 掃描檔案
    print(f'[scan] 目錄:')
    for d in SCAN_DIRS:
        print(f'   - {d}  {"(OK)" if d.exists() else "(缺)"}')
    files = list(iter_rule_files(args.system))
    print(f'[scan] 找到 {len(files)} 個 .md 檔')
    if args.system:
        print(f'[scan] 系統過濾：{args.system}')

    if not files:
        print('沒有檔案，結束。')
        return 0

    # 切塊
    print(f'\n[split] 切分規則...')
    chunks = chunks_from_files(files)
    print(f'[split] 共切出 {len(chunks)} 條 chunk')

    if args.limit:
        chunks = chunks[:args.limit]
        print(f'[limit] 截取前 {len(chunks)} 條')

    if args.dry_run:
        print('\n[dry-run] 預覽前 5 條：')
        for c in chunks[:5]:
            print('-' * 60)
            print(f'system={c.system}  type={c.rule_type}')
            print(f'title={c.title}')
            print(f'chapter={c.source_chapter}')
            print(f'source={c.source}')
            print(f'content[:120]={c.content[:120].replace(chr(10), " / ")}')
        print('-' * 60)
        print(f'[dry-run] 不做 embedding 不做 insert，結束。共會匯入 {len(chunks)} 條。')
        return 0

    # embed + insert
    if not supabase_url or not service_key:
        print('錯誤：Supabase 環境變數缺失（NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY）', file=sys.stderr)
        return 1

    print(f'\n[embed] 批次大小 = {VOYAGE_BATCH_SIZE}，總計 {len(chunks)} 條')
    total_inserted = 0
    for i in range(0, len(chunks), VOYAGE_BATCH_SIZE):
        batch = chunks[i:i + VOYAGE_BATCH_SIZE]
        texts = [build_embed_text(c) for c in batch]
        t0 = time.time()
        vectors = voyage_embed(texts, voyage_key)
        rows = []
        for c, v in zip(batch, vectors):
            rows.append({
                'system':         c.system,
                'rule_type':      c.rule_type,
                'title':          c.title[:500],
                'content':        c.content,
                'source':         c.source,
                'source_chapter': c.source_chapter,
                'embedding':      v,
                'metadata':       c.metadata,
            })
        supabase_insert(rows, supabase_url, service_key)
        total_inserted += len(rows)
        print(f'  [{i + len(batch):>4}/{len(chunks)}] embedded+inserted {len(rows)} 條，耗時 {time.time() - t0:.1f}s')

    print(f'\n[done] 匯入完成：{total_inserted} 條')
    return 0


def build_embed_text(c: RuleChunk) -> str:
    """組 embedding input：title + chapter + content，讓檢索能吃到標題資訊。"""
    parts: list[str] = []
    if c.title:
        parts.append(f'【{c.title}】')
    if c.source_chapter and c.source_chapter != c.title:
        parts.append(f'（{c.source_chapter}）')
    parts.append(c.content)
    return '\n'.join(parts)


if __name__ == '__main__':
    sys.exit(main())
