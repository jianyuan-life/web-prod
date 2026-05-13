// v5.10.231 — Compatibility PDF template POC
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import type { CompatibilityReport } from '@/types/report-schemas'

const styles = StyleSheet.create({
  page: { padding: 48, backgroundColor: '#0A0E22', color: '#F8FAFC' },
  topBand: { height: 4, backgroundColor: '#D4A04A', marginBottom: 32 },
  eyebrow: { fontSize: 10, color: '#D4A04A', letterSpacing: 4, marginBottom: 12 },
  pairRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    marginBottom: 16,
  },
  name: { fontSize: 36, fontWeight: 700, color: '#D4A04A' },
  cross: { fontSize: 24, color: '#D4A04A' },
  meta: { fontSize: 10, color: '#94A3B8', marginBottom: 24, textAlign: 'center' },
  verdictBox: {
    alignSelf: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 999,
    marginBottom: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  verdictText: { fontSize: 18, fontWeight: 700, color: '#0A0E22' },
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 14, fontWeight: 600, color: '#E5B95C', marginBottom: 8 },
  body: { fontSize: 11, color: '#CBD5E1', lineHeight: 1.6, marginBottom: 4 },
  systemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  systemName: { fontSize: 11, color: '#F8FAFC', fontWeight: 600 },
  systemVerdict: { fontSize: 11, color: '#4ADE80' },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 48,
    right: 48,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 8,
    color: '#64748B',
    borderTopWidth: 1,
    borderTopColor: 'rgba(229, 185, 92, 0.2)',
    paddingTop: 8,
  },
})

const VERDICT_COLOR: Record<string, string> = {
  '合': '#4ADE80',
  '合但有雷區': '#FBBF24',
  '需要磨合': '#60A5FA',
  '不合': '#EF4444',
}

export function CompatibilityPDF({ data }: { data: CompatibilityReport }) {
  return (
    <Document title={`合否? · ${data.pair.a.name}×${data.pair.b.name}`} author="鑒源 JianYuan">
      <Page size="A4" style={styles.page}>
        <View style={styles.topBand} />
        <Text style={[styles.eyebrow, { textAlign: 'center' }]}>COMPATIBILITY · 合否?</Text>

        <View style={styles.pairRow}>
          <Text style={styles.name}>{data.pair.a.name}</Text>
          <Text style={styles.cross}>✕</Text>
          <Text style={styles.name}>{data.pair.b.name}</Text>
        </View>

        <Text style={styles.meta}>
          場景:{data.scenario} · {data.meta.reportDate}
        </Text>

        <View style={[styles.verdictBox, { backgroundColor: VERDICT_COLOR[data.verdict] || '#94A3B8' }]}>
          <Text style={styles.verdictText}>{data.verdictMeta.icon} {data.verdict}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>✨ 你們的問題</Text>
          <Text style={[styles.body, { fontStyle: 'italic' }]}>「{data.question.raw}」</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📜 你們的答案</Text>
          {data.answerChapter.body.slice(0, 4).map((p, i) => (
            <Text key={i} style={styles.body}>{p}</Text>
          ))}
        </View>

        <View style={styles.footer}>
          <Text>鑒源 JianYuan · {data.meta.engineVersion}</Text>
          <Text>報告編號 #{data.meta.id}</Text>
        </View>
      </Page>

      {/* Page 2: 七大系統合盤 + 綜合判定 */}
      <Page size="A4" style={styles.page}>
        <View style={styles.topBand} />
        <Text style={styles.eyebrow}>七大系統合盤 + 綜合判定</Text>

        <View style={styles.section}>
          <View style={styles.systemRow}>
            <Text style={styles.systemName}>八字</Text>
            <Text style={styles.systemVerdict}>{data.baziSynastry.verdict}</Text>
          </View>
          <View style={styles.systemRow}>
            <Text style={styles.systemName}>紫微</Text>
            <Text style={styles.systemVerdict}>{data.ziweiSynastry.verdict}</Text>
          </View>
          <View style={styles.systemRow}>
            <Text style={styles.systemName}>西占 Synastry</Text>
            <Text style={styles.systemVerdict}>{data.westernSynastry.verdict}</Text>
          </View>
          <View style={styles.systemRow}>
            <Text style={styles.systemName}>吠陀 Kuta</Text>
            <Text style={styles.systemVerdict}>{data.vedicKuta.verdict}</Text>
          </View>
          <View style={styles.systemRow}>
            <Text style={styles.systemName}>人類圖</Text>
            <Text style={styles.systemVerdict}>{data.hdPair.verdict}</Text>
          </View>
          <View style={styles.systemRow}>
            <Text style={styles.systemName}>數字命理</Text>
            <Text style={styles.systemVerdict}>{data.numerologyPair.verdict}</Text>
          </View>
          <View style={styles.systemRow}>
            <Text style={styles.systemName}>易經</Text>
            <Text style={styles.systemVerdict}>{data.ichingPair.verdict}</Text>
          </View>
          <View style={styles.systemRow}>
            <Text style={styles.systemName}>生肖</Text>
            <Text style={styles.systemVerdict}>{data.zodiacPair.verdict}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>★ 綜合判定</Text>
          <Text style={styles.body}>合 {data.finalJudge.countCompat} / 需磨合 {data.finalJudge.countNeed} / 不合 {data.finalJudge.countNot}</Text>
          <Text style={[styles.body, { color: '#FBBF24', marginTop: 8 }]}>{data.finalJudge.summary}</Text>
        </View>

        <View style={styles.footer}>
          <Text>鑒源 JianYuan · {data.meta.engineVersion}</Text>
          <Text>{data.pair.a.name} × {data.pair.b.name}</Text>
        </View>
      </Page>

      {/* TODO Sprint 2:三年流年 + bestPoints/cautions/prescriptions/雙人 letter */}
    </Document>
  )
}
