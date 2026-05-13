// v5.10.230 — HeartDoubts PDF template POC(@react-pdf 對齊 LifeBP pattern)
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import type { HeartDoubtsReport } from '@/types/report-schemas'

const styles = StyleSheet.create({
  page: { padding: 48, backgroundColor: '#0A0E22', color: '#F8FAFC' },
  topBand: { height: 4, backgroundColor: '#D4A04A', marginBottom: 32 },
  eyebrow: { fontSize: 10, color: '#D4A04A', letterSpacing: 4, marginBottom: 12 },
  hero: { fontSize: 48, fontWeight: 700, color: '#D4A04A', marginBottom: 8 },
  meta: { fontSize: 10, color: '#94A3B8', marginBottom: 24 },
  scoreBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderWidth: 2,
    borderColor: '#D4A04A',
    borderRadius: 8,
    marginBottom: 24,
  },
  grade: { fontSize: 56, fontWeight: 700, color: '#D4A04A' },
  scoreText: { fontSize: 14, color: '#CBD5E1' },
  question: {
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#D4A04A',
    backgroundColor: 'rgba(212, 160, 74, 0.08)',
    marginBottom: 24,
  },
  questionText: { fontSize: 14, fontStyle: 'italic', color: '#F8FAFC' },
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
  body: { fontSize: 11, color: '#CBD5E1', lineHeight: 1.6, marginBottom: 4 },
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
  pageNumber: { fontSize: 8, color: '#64748B' },
})

export interface HeartDoubtsPDFProps {
  data: HeartDoubtsReport
}

export function HeartDoubtsPDF({ data }: HeartDoubtsPDFProps) {
  return (
    <Document title={`心之所惑 · ${data.meta.name}`} author="鑒源 JianYuan">
      <Page size="A4" style={styles.page}>
        <View style={styles.topBand} />
        <Text style={styles.eyebrow}>HEART DOUBTS · 心之所惑</Text>
        <Text style={styles.hero}>{data.meta.name}</Text>
        <Text style={styles.meta}>
          出生:{new Date(data.meta.birthDate).toLocaleDateString('zh-TW')} · 報告日期 {data.meta.reportDate}
        </Text>

        {/* Score box */}
        <View style={styles.scoreBox}>
          <Text style={styles.grade}>{data.score.grade}</Text>
          <View>
            <Text style={styles.scoreText}>命格綜合評分:{data.score.value}/100</Text>
            <Text style={[styles.scoreText, { fontSize: 10, color: '#94A3B8' }]}>
              對標同型客戶 · Top {data.score.percentile}% · 挑戰度 {data.score.challengeLevel}
            </Text>
          </View>
        </View>

        {/* 你的問題 */}
        <View style={styles.question}>
          <Text style={[styles.scoreText, { fontSize: 9, color: '#64748B', marginBottom: 4 }]}>你的問題</Text>
          <Text style={styles.questionText}>「{data.question.raw}」</Text>
        </View>

        {/* 你的答案 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>✨ 你的答案</Text>
          <Text style={[styles.body, { fontWeight: 600, color: '#F8FAFC' }]}>
            結論:{data.answer.conclusion}
          </Text>
          <Text style={[styles.body, { color: '#FBBF24' }]}>
            前提:{data.answer.condition}
          </Text>
          {data.answer.paragraphs.slice(0, 3).map((p, i) => (
            <Text key={i} style={styles.body}>{p}</Text>
          ))}
        </View>

        <View style={styles.footer}>
          <Text>鑒源 JianYuan · {data.meta.engineVersion}</Text>
          <Text>報告編號 #{data.meta.id} · {data.meta.reportDate}</Text>
        </View>
        <Text
          style={{ ...styles.pageNumber, position: 'absolute', bottom: 8, right: 48 }}
          render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
          fixed
        />
      </Page>

      {/* Page 2: Best Plan + Risks */}
      <Page size="A4" style={styles.page}>
        <View style={styles.topBand} />
        <Text style={styles.eyebrow}>最佳行動方案 + 風險</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🎯 短期(現在到 7 月)</Text>
          {data.chapters.bestPlan.short.actions.map((a, i) => (
            <Text key={i} style={styles.body}>→ {a}</Text>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🎯 中期(7-10 月)</Text>
          {data.chapters.bestPlan.mid.actions.map((a, i) => (
            <Text key={i} style={styles.body}>→ {a}</Text>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🎯 長期(10 月後)</Text>
          {data.chapters.bestPlan.long.actions.map((a, i) => (
            <Text key={i} style={styles.body}>→ {a}</Text>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>⚠ 最大風險({data.chapters.risks.length} 條)</Text>
          {data.chapters.risks.map((r, i) => (
            <View key={i} style={{ marginBottom: 8 }}>
              <Text style={[styles.body, { color: '#F87171', fontWeight: 600 }]}>· {r.title}</Text>
              <Text style={[styles.body, { color: '#94A3B8', marginLeft: 8 }]}>{r.detail}</Text>
            </View>
          ))}
        </View>

        <View style={styles.footer}>
          <Text>鑒源 JianYuan · {data.meta.engineVersion}</Text>
          <Text>{data.meta.name} · 心之所惑</Text>
        </View>
        <Text
          style={{ ...styles.pageNumber, position: 'absolute', bottom: 8, right: 48 }}
          render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
          fixed
        />
      </Page>

      {/* TODO Sprint 2:剩 root/caveats/way/goods/improvements/letter sections */}
    </Document>
  )
}
