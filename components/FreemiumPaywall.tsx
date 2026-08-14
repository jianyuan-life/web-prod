'use client'

import Link from 'next/link'
import { useState } from 'react'

type ReportModule = {
  title: string
  hint: string
  detail: string
}

interface Props {
  systemName: string
  clientName?: string
}

const REPORT_MODULES: ReportModule[] = [
  {
    title: '未來 12 月流年',
    hint: '逐月運勢曲線',
    detail: '逐月整理較重要的高低變化、轉折月份，以及適合主動或暫緩的時段。',
  },
  {
    title: '事業轉折點',
    hint: '發展期與調整期',
    detail: '從命盤脈絡整理事業發展節奏、工作型態傾向與需要留意的轉換時機。',
  },
  {
    title: '財富軌跡',
    hint: '正財與偏財傾向',
    detail: '整理財務決策傾向、較適合的累積方式，以及不同週期需要留意的風險。',
  },
  {
    title: '關係時機',
    hint: '互動模式與感情節奏',
    detail: '說明關係中的需求、溝通模式與較重要的互動週期，供你自行核對。',
  },
  {
    title: '風險提醒',
    hint: '容易忽略的課題',
    detail: '把健康、人際與決策中反覆出現的課題整理成可辨識的提醒，不以恐嚇式預言呈現。',
  },
  {
    title: '行動清單',
    hint: '把解讀轉為下一步',
    detail: '將跨系統解讀收斂成具體練習與觀察方向；建議仍由你依實際情況判斷。',
  },
]

export default function FreemiumPaywall({ systemName, clientName }: Props) {
  const [openModule, setOpenModule] = useState<number | null>(null)
  const [showCompare, setShowCompare] = useState(false)
  const heading = clientName ? `${clientName}，速算已完成` : '速算已完成'

  return (
    <section className="jy-upgrade" aria-labelledby="free-tool-upgrade-title">
      <header className="jy-upgrade__header">
        <p className="jy-eyebrow">FROM QUICK VIEW TO FULL DOSSIER</p>
        <h2 id="free-tool-upgrade-title">{heading}</h2>
        <p>
          上方是單一 {systemName} 系統的免費速覽。人生藍圖會把它與其餘命理系統交叉閱讀，並將結論、依據與行動建議分開呈現。
        </p>
      </header>

      <div className="jy-upgrade__modules" aria-label="完整報告增加的閱讀模組">
        {REPORT_MODULES.map((module, index) => {
          const isOpen = openModule === index
          const panelId = `report-module-${index}`
          return (
            <button
              key={module.title}
              type="button"
              className="jy-upgrade-module"
              aria-expanded={isOpen}
              aria-controls={panelId}
              onClick={() => setOpenModule(isOpen ? null : index)}
            >
              <span className="jy-upgrade-module__index">{String(index + 1).padStart(2, '0')}</span>
              <span>
                <strong>{module.title}</strong>
                <small>{module.hint}</small>
              </span>
              <span className="jy-upgrade-module__toggle" aria-hidden="true">{isOpen ? '−' : '+'}</span>
            </button>
          )
        })}
      </div>

      {openModule !== null && (
        <div id={`report-module-${openModule}`} className="jy-upgrade__detail" role="region" aria-live="polite">
          <p className="jy-eyebrow">{REPORT_MODULES[openModule].title}</p>
          <p>{REPORT_MODULES[openModule].detail}</p>
        </div>
      )}

      <div className="jy-upgrade__decision">
        <div>
          <span>人生藍圖 · 一次性付款</span>
          <strong>US$89</strong>
          <small>付款前仍可核對方案、出生資料與應付金額</small>
        </div>
        <Link href="/checkout?plan=C" className="jy-button jy-button--primary">
          查看人生藍圖方案
        </Link>
      </div>

      <button
        type="button"
        className="jy-upgrade__compare-toggle"
        aria-expanded={showCompare}
        aria-controls="free-paid-comparison"
        onClick={() => setShowCompare((visible) => !visible)}
      >
        {showCompare ? '收起方案差異' : '比較免費速算與完整報告'}
      </button>

      {showCompare && (
        <div id="free-paid-comparison" className="jy-comparison-wrap" tabIndex={0}>
          <table className="jy-comparison-table">
            <caption>免費 {systemName} 速算與人生藍圖比較</caption>
            <thead>
              <tr>
                <th scope="col">項目</th>
                <th scope="col">免費速算</th>
                <th scope="col">人生藍圖 · US$89</th>
              </tr>
            </thead>
            <tbody>
              <tr><th scope="row">{systemName} 排盤</th><td>基礎速覽</td><td>完整解讀</td></tr>
              <tr><th scope="row">跨系統閱讀</th><td>—</td><td>14 套系統交叉整理</td></tr>
              <tr><th scope="row">未來 12 月</th><td>—</td><td>逐月重點</td></tr>
              <tr><th scope="row">事業／財務／關係</th><td>簡要</td><td>分章說明</td></tr>
              <tr><th scope="row">行動建議</th><td>—</td><td>具體清單</td></tr>
              <tr><th scope="row">交付</th><td>網頁即時結果</td><td>網頁報告與 PDF</td></tr>
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
