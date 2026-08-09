import styles from './ConsultationReportReader.module.css'

export function ReportUnavailable() {
  return (
    <div className={styles.shell} data-consultation-report>
      <section className={styles.unavailable}>
        <p className={styles.kicker}>鑑源 · 私人報告</p>
        <h1>這份報告目前不能顯示</h1>
        <p>內容尚未符合完整呈現條件，因此沒有載入部分文字。請回到「我的報告」查看狀態，或聯絡客服協助。</p>
        <div>
          <a className={styles.primaryLink} href="/dashboard">前往我的報告</a>
          <a className={styles.secondaryLink} href="mailto:support@jianyuan.life">聯絡客服</a>
        </div>
      </section>
    </div>
  )
}
