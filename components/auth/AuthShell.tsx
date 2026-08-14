import type { ReactNode } from 'react'

interface AuthShellProps {
  eyebrow: string
  title: string
  description: string
  children: ReactNode
  contextTitle?: string
  contextBody?: string
}

export default function AuthShell({
  eyebrow,
  title,
  description,
  children,
  contextTitle = '你的資料，只用來完成服務',
  contextBody = '登入後可集中查看已購買與生成中的報告，並追蹤處理進度。',
}: AuthShellProps) {
  return (
    <section className="jy-page jy-auth-page" aria-label="帳號服務">
      <div className="jy-auth-shell">
        <aside className="jy-auth-context" aria-label="帳號服務說明">
          <div>
            <p className="jy-eyebrow">PRIVATE READING ARCHIVE</p>
            <p className="jy-auth-context__title">{contextTitle}</p>
            <p className="jy-auth-context__body">{contextBody}</p>
          </div>

          <dl className="jy-auth-notes">
            <div>
              <dt>01</dt>
              <dd>集中管理已購買與生成中的報告</dd>
            </div>
            <div>
              <dt>02</dt>
              <dd>付款由 Stripe 處理，鑑源不保存卡片資料</dd>
            </div>
            <div>
              <dt>03</dt>
              <dd>可依隱私政策申請下載、更正或刪除資料</dd>
            </div>
          </dl>
        </aside>

        <section className="jy-auth-main">
          <header className="jy-auth-heading">
            <p className="jy-eyebrow">{eyebrow}</p>
            <h1>{title}</h1>
            <p>{description}</p>
          </header>
          {children}
        </section>
      </div>
    </section>
  )
}
