import styles from '@/components/consultation/reader/ConsultationReportReader.module.css'

export default function ConsultationReportNotFound() {
  return (
    <div className={styles.shell} data-consultation-report>
      <section className={styles.unavailable}>
        <p className={styles.kicker}>鑑源 · 私人報告</p>
        <h1>找不到這份報告</h1>
        <p>連結可能不完整、已失效，或不屬於人生藍圖與家族藍圖。請從「我的報告」重新開啟。</p>
        <div>
          <a className={styles.primaryLink} href="/dashboard">前往我的報告</a>
          <a className={styles.secondaryLink} href="/">回到首頁</a>
        </div>
      </section>
    </div>
  )
}
