/**
 * v5.10.495:對外 14 套系統的單一來源(SSOT)
 *
 * 根因(production 兒童實單 2b3cb069 實測):對外清零 15→14 的排除清單在
 * SystemsAnchorList / SystemsRadar / report page ×2 / share-card 共 5 處各自
 * 維護,且全部用「完全比對」['南洋術數','南洋数术','南洋']。AI 產出的系統名
 * 只要是變體(南洋命理 / 南洋命理參考 / 南洋術)就漏接 → 同屏出現
 * 「14 套系統 · 點擊跳詳解」與右側「15 套」自相矛盾。
 *
 * 對外一律 14 套(南洋術數訓練不足、v5.3.95 老闆拍板對外清零)。
 */

/** 對外不列名的系統(前綴比對、涵蓋所有命名變體) */
export function isExcludedSystem(system: string | null | undefined): boolean {
  if (!system) return true
  return /南洋/.test(system)
}

/** 對外可列名的系統上限(對外宣稱 14 套的硬上限) */
export const PUBLIC_SYSTEM_CAP = 14

/**
 * 從 analyses_summary 取對外可顯示的系統清單。
 * @param minScore 低於此分視為 missing data、不顯示(0 = 不過濾)
 */
export function publicSystems<T extends { system: string; score?: number }>(
  analyses: readonly T[] | null | undefined,
  minScore = 0,
): T[] {
  if (!Array.isArray(analyses)) return []
  return analyses
    .filter((a) => a && a.system && !isExcludedSystem(a.system))
    .filter((a) => (minScore > 0 ? Number(a.score) > minScore : true))
    .slice(0, PUBLIC_SYSTEM_CAP)
}

/** 對外可宣稱的系統數(永遠 ≤ 14、且與實際顯示筆數一致) */
export function publicSystemCount<T extends { system: string; score?: number }>(
  analyses: readonly T[] | null | undefined,
  minScore = 0,
): number {
  return publicSystems(analyses, minScore).length
}
