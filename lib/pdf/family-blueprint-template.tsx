// v5.10.231 — FamilyBlueprint PDF template POC
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import type { FamilyBlueprintReport } from '@/types/report-schemas'

const styles = StyleSheet.create({
  page: { padding: 48, backgroundColor: '#0A0E22', color: '#F8FAFC' },
  topBand: { height: 4, backgroundColor: '#D4A04A', marginBottom: 32 },
  eyebrow: { fontSize: 10, color: '#D4A04A', letterSpacing: 4, marginBottom: 12 },
  hero: { fontSize: 48, fontWeight: 700, color: '#D4A04A', marginBottom: 8, textAlign: 'center' },
  meta: { fontSize: 10, color: '#94A3B8', marginBottom: 32, textAlign: 'center' },
  membersRow: { flexDirection: 'row', justifyContent: 'center', gap: 24, marginBottom: 24 },
  memberCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#D4A04A',
    color: '#0A0E22',
    fontSize: 18,
    fontWeight: 700,
    textAlign: 'center',
    paddingTop: 28,
  },
  memberName: { fontSize: 11, color: '#CBD5E1', textAlign: 'center', marginTop: 8 },
  section: { marginBottom: 16 },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: '#E5B95C',
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(229, 185, 92, 0.3)',
    paddingBottom: 4,
  },
  metaphor: {
    fontSize: 14,
    fontStyle: 'italic',
    color: '#D4A04A',
    padding: 16,
    backgroundColor: 'rgba(212, 160, 74, 0.08)',
    borderLeftWidth: 4,
    borderLeftColor: '#D4A04A',
    marginBottom: 16,
  },
  body: { fontSize: 11, color: '#CBD5E1', lineHeight: 1.6, marginBottom: 4 },
  yearCard: {
    flex: 1,
    padding: 8,
    borderWidth: 1,
    borderColor: 'rgba(229, 185, 92, 0.3)',
    borderRadius: 4,
    marginHorizontal: 2,
  },
  yearTitle: { fontSize: 14, fontWeight: 700, color: '#D4A04A', textAlign: 'center' },
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

export function FamilyBlueprintPDF({ data }: { data: FamilyBlueprintReport }) {
  return (
    <Document title={`家族藍圖 · ${data.meta.familyName}`} author="鑒源 JianYuan">
      <Page size="A4" style={styles.page}>
        <View style={styles.topBand} />
        <Text style={[styles.eyebrow, { textAlign: 'center' }]}>FAMILY BLUEPRINT · 家族藍圖</Text>
        <Text style={styles.hero}>{data.meta.familyName}</Text>
        <Text style={styles.meta}>{data.meta.memberCount} 位成員 · {data.meta.reportDate}</Text>

        <View style={styles.membersRow}>
          {data.members.map((m) => (
            <View key={m.name}>
              <Text style={styles.memberCircle}>{m.role}</Text>
              <Text style={styles.memberName}>{m.name}</Text>
              <Text style={[styles.memberName, { fontSize: 9, color: '#64748B' }]}>日主 {m.bazi.dayMaster}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.metaphor}>
          {data.fiveElementsDistribution.metaphor}
        </Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🔥 關鍵發現</Text>
          <Text style={styles.body}>{data.fiveElementsDistribution.keyFinding}</Text>
        </View>

        <View style={styles.footer}>
          <Text>鑒源 JianYuan · {data.meta.engineVersion}</Text>
          <Text>報告編號 #{data.meta.id}</Text>
        </View>
      </Page>

      {/* Page 2: 5 年流年 */}
      <Page size="A4" style={styles.page}>
        <View style={styles.topBand} />
        <Text style={styles.eyebrow}>家族 5 年流年</Text>

        <View style={{ flexDirection: 'row', marginBottom: 16, gap: 4 }}>
          {data.yearly5.map((y) => (
            <View key={y.year} style={styles.yearCard}>
              <Text style={styles.yearTitle}>{y.year}</Text>
              <Text style={[styles.body, { fontSize: 9, textAlign: 'center', marginTop: 4 }]}>{y.icon} {y.nickname}</Text>
              <Text style={[styles.body, { fontSize: 8, color: '#94A3B8', textAlign: 'center' }]}>{y.ganzhi}</Text>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>5 年總覽</Text>
          <Text style={styles.body}>🌟 黃金年:{data.fiveYearOverview.goldenYear}</Text>
          <Text style={styles.body}>🔄 修整年:{data.fiveYearOverview.repairYear}</Text>
          <Text style={styles.body}>🎯 重大決策窗口:{data.fiveYearOverview.decisionWindows.join(' / ')}</Text>
          <Text style={[styles.body, { color: '#F87171' }]}>⚠ 最大挑戰:{data.fiveYearOverview.biggestChallenge}</Text>
        </View>

        <View style={styles.footer}>
          <Text>鑒源 JianYuan · {data.meta.engineVersion}</Text>
          <Text>{data.meta.familyName} · 家族藍圖</Text>
        </View>
      </Page>

      {/* TODO Sprint 2:對偶分析 + 三角動力 + 8 處方箋 + family letter */}
    </Document>
  )
}
