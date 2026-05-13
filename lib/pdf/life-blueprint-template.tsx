// v5.10.226 — LifeBlueprint PDF template POC(@react-pdf/renderer minimum、Gemini Top 1 推薦)
//
// Gemini L4 finding:「@react-pdf 採用獨立的 Yoga 渲染引擎、無法直接復用 Web 端的 Tailwind DOM」
// → 建立平行 PDF component tree、鏡像 React 結構但用 PDF 元件
//
// Sprint 1 POC:hero + meta + bazi + oneLiner + 印章(minimum 證明可行性)
// Sprint 2+:完整 17 sections + 紫微 12 宮 PNG / SVG embed + 圖表轉 PNG
//
// 字體:Noto Serif TC subset(public/fonts/、self-host、Sprint 2 加 Font.register)
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import type { LifeBlueprintReport } from '@/types/report-schemas'

// PDF 樣式(Yoga flex、不能用 Tailwind)
const styles = StyleSheet.create({
  page: {
    padding: 48,
    backgroundColor: '#0A0E22',
    color: '#F8FAFC',
  },
  // Header gold band
  topBand: {
    height: 4,
    backgroundColor: '#D4A04A',
    marginBottom: 32,
  },
  eyebrow: {
    fontSize: 10,
    color: '#D4A04A',
    letterSpacing: 4,
    marginBottom: 12,
  },
  hero: {
    fontSize: 48,
    fontWeight: 700,
    color: '#D4A04A',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#CBD5E1',
    marginBottom: 24,
  },
  meta: {
    fontSize: 10,
    color: '#94A3B8',
    marginBottom: 32,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 600,
    color: '#E5B95C',
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(229, 185, 92, 0.3)',
    paddingBottom: 4,
  },
  baziRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  baziCell: {
    flex: 1,
    alignItems: 'center',
    padding: 8,
    borderWidth: 1,
    borderColor: 'rgba(229, 185, 92, 0.2)',
    borderRadius: 4,
    marginHorizontal: 2,
  },
  baziLabel: {
    fontSize: 9,
    color: '#94A3B8',
    marginBottom: 4,
  },
  baziChar: {
    fontSize: 24,
    fontWeight: 700,
    color: '#FB7185',
  },
  oneLiner: {
    fontSize: 18,
    fontStyle: 'italic',
    color: '#D4A04A',
    textAlign: 'center',
    marginVertical: 32,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(229, 185, 92, 0.3)',
  },
  // Footer
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 48,
    right: 48,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 8,
    color: '#64748B',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(229, 185, 92, 0.2)',
  },
  pageNumber: {
    fontSize: 8,
    color: '#64748B',
  },
})

export interface LifeBlueprintPDFProps {
  data: LifeBlueprintReport
}

export function LifeBlueprintPDF({ data }: LifeBlueprintPDFProps) {
  return (
    <Document
      title={`人生藍圖 · ${data.meta.name}`}
      author="鑒源 JianYuan"
      subject={`${data.meta.name} 人生藍圖報告 · ${data.meta.engineVersion}`}
    >
      {/* Cover Page */}
      <Page size="A4" style={styles.page}>
        <View style={styles.topBand} />
        <Text style={styles.eyebrow}>LIFE BLUEPRINT · 人生藍圖</Text>
        <Text style={styles.hero}>{data.hero.title}</Text>
        <Text style={styles.subtitle}>{data.hero.subtitle}</Text>
        <Text style={styles.meta}>
          {data.meta.name} · {new Date(data.meta.birthDate).toLocaleDateString('zh-TW')} · {data.meta.birthPlace}
        </Text>

        {/* 八字四柱 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📜 八字四柱</Text>
          <View style={styles.baziRow}>
            <BaziCell label="年" value={data.card5.bazi.year} />
            <BaziCell label="月" value={data.card5.bazi.month} />
            <BaziCell label="日" value={data.card5.bazi.day} highlight />
            <BaziCell label="時" value={data.card5.bazi.hour} />
          </View>
        </View>

        {/* 命格名片 5 件套 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📋 命格名片</Text>
          <Text style={{ fontSize: 10, color: '#CBD5E1', marginBottom: 8 }}>
            紫微命宮:{data.card5.ziwei.palaceStar}({data.card5.ziwei.palace})
          </Text>
          <Text style={{ fontSize: 10, color: '#94A3B8', marginBottom: 4 }}>✓ 天賦 Top 3:</Text>
          {data.card5.talentsTop3.map((t, i) => (
            <Text key={i} style={{ fontSize: 10, color: '#CBD5E1', marginLeft: 8 }}>· {t}</Text>
          ))}
          <Text style={{ fontSize: 10, color: '#94A3B8', marginBottom: 4, marginTop: 8 }}>⚠ 課題 Top 3:</Text>
          {data.card5.challengesTop3.map((c, i) => (
            <Text key={i} style={{ fontSize: 10, color: '#CBD5E1', marginLeft: 8 }}>· {c}</Text>
          ))}
        </View>

        {/* 一句話總結 */}
        <Text style={styles.oneLiner}>「{data.oneLiner}」</Text>

        {/* Footer */}
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

      {/* Page 2:命格 3 層洞察 */}
      <Page size="A4" style={styles.page}>
        <View style={styles.topBand} />
        <Text style={styles.eyebrow}>命格 3 層洞察</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>STEP 1 · {data.insight3steps.step1.title}</Text>
          <Text style={{ fontSize: 11, color: '#CBD5E1', lineHeight: 1.6 }}>
            {data.insight3steps.step1.content}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>STEP 2 · 三軸 Dashboard</Text>
          <Text style={{ fontSize: 11, color: '#CBD5E1', marginBottom: 4 }}>
            個性 {data.insight3steps.step2.dashboard.personality} / 行動 {data.insight3steps.step2.dashboard.action} / 修行 {data.insight3steps.step2.dashboard.cultivation}
          </Text>
          <Text style={{ fontSize: 10, color: '#FBBF24' }}>
            ⚠ {data.insight3steps.step2.trapWarning}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>STEP 3 · 優先行動</Text>
          {data.insight3steps.step3.priorityActions.map((action, i) => (
            <Text key={i} style={{ fontSize: 10, color: '#CBD5E1', marginBottom: 4 }}>
              [{action.date}] {action.text}
            </Text>
          ))}
        </View>

        <View style={styles.footer}>
          <Text>鑒源 JianYuan · {data.meta.engineVersion}</Text>
          <Text>{data.meta.name} · 人生藍圖</Text>
        </View>
        <Text
          style={{ ...styles.pageNumber, position: 'absolute', bottom: 8, right: 48 }}
          render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
          fixed
        />
      </Page>

      {/* TODO Sprint 2:剩 14 sections + 紫微 12 宮 SVG embed + 14 系統共識矩陣 + 大運時間軸 + 12 月能量 + 起承轉合 16 章 + 處方箋 + 報告印章 */}
    </Document>
  )
}

function BaziCell({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  const cellStyle = highlight
    ? { ...styles.baziCell, borderColor: '#D4A04A', backgroundColor: 'rgba(212, 160, 74, 0.1)' }
    : styles.baziCell
  return (
    <View style={cellStyle}>
      <Text style={styles.baziLabel}>{label}柱</Text>
      <Text style={styles.baziChar}>{value}</Text>
    </View>
  )
}
