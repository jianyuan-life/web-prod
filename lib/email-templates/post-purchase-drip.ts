// ============================================================
// 提示詞合集 Prompt 4 — Post-purchase 5 封 Email Drip
// ============================================================
// 🔴 資產盤點修正(2026-05-16):`app/api/cron/followup-email/route.ts`
//   **已存在**「完成後 D+3 跟進信 + 出門訣 CTA + followup_sent dedup」=
//   等同本序列的 step 2。本檔不是新獨立功能,而是**擴充既有 cron** 的
//   D+0/1/7/14 其餘 4 觸點的模板來源 — wire 時必接進既有 followup-email
//   route(沿用 followup_sent / sendEmailWithRetry / lib/unsubscribe),
//   **嚴禁另起平行 cron**(會與既有重複寄信、lesson #144 雙實作分裂)。
//   trigger = paid_reports.completed_at。cron 排程改動 = 老闆(auto-sync 例外 e)。

export interface DripCtx {
  customerName: string
  planName: string
  reportToken: string
  siteUrl?: string
  unsubscribeHtml?: string // 呼叫端用既有 getUnsubscribeHtml() 傳入
}

export interface DripEmail {
  step: number
  offsetDays: number
  subject: string
  html: string
}

function wrap(inner: string, ctx: DripCtx): string {
  const site = ctx.siteUrl || 'https://jianyuan.life'
  return `<div style="font-family:system-ui,'Noto Sans TC',sans-serif;max-width:560px;margin:0 auto;color:#222;line-height:1.8">
${inner}
<p style="margin-top:24px"><a href="${site}/report/${ctx.reportToken}" style="display:inline-block;background:#B33A2E;color:#fff;padding:10px 22px;border-radius:8px;text-decoration:none">開啟我的報告</a></p>
<p style="color:#999;font-size:12px;margin-top:22px">鑑源命理平台 · ${site}${ctx.unsubscribeHtml ? ' · ' + ctx.unsubscribeHtml : ''}</p></div>`
}

/** 產生 5 封 drip(utm 已帶);呼叫端依 step 排程寄 */
export function buildPostPurchaseDrip(ctx: DripCtx): DripEmail[] {
  const n = ctx.customerName
  const p = ctx.planName
  return [
    {
      step: 0,
      offsetDays: 0,
      subject: `${n},你的「${p}」報告連結(收藏這封,別弄丟了)`,
      html: wrap(
        `<h2>${n},報告好了 🎉</h2><p>這封請收藏 — 之後想再讀,從這裡就能直接打開,不必翻訊息。</p>
<p>建議找個安靜的 15 分鐘,先看「命格總覽」那段,那是整份報告的鑰匙。</p>`,
        ctx,
      ),
    },
    {
      step: 1,
      offsetDays: 1,
      subject: `${n},這 3 個段落你不能跳過`,
      html: wrap(
        `<h2>怎麼讀懂這份報告</h2><p>很多人第一次讀會被術語勸退。其實只要抓 3 段:</p>
<ol><li>命格總覽 — 你是誰</li><li>TOP 5 優勢/風險 — 你該押注什麼</li><li>三階段行動 — 接下來怎麼做</li></ol>
<p>術語都在括號裡,先讀白話結論就好。</p>`,
        ctx,
      ),
    },
    {
      step: 2,
      offsetDays: 3,
      subject: `${n},報告裡最戳人的那一段`,
      html: wrap(
        `<h2>回去看看這段</h2><p>讀者最常截圖傳給朋友的,是「需要注意的地方」那節 —
不是因為它負面,而是因為它把你一直說不出口的東西講白了。今天就花 5 分鐘回去重讀那段。</p>`,
        ctx,
      ),
    },
    {
      step: 3,
      offsetDays: 7,
      subject: `${n},這週的小練習(對齊你的命格)`,
      html: wrap(
        `<h2>一週後,複習 + 微調</h2><p>報告裡的「刻意練習 / 改善方案」是設計來做、不是看的。
挑一條本週能做的最小行動,做了就好。下個月運勢轉換時,你會感謝現在的自己。</p>`,
        ctx,
      ),
    },
    {
      step: 4,
      offsetDays: 14,
      subject: `${n},想知道「什麼時候做最順」嗎?`,
      html: wrap(
        `<h2>下一步:挑對時機</h2><p>你已經知道「自己是誰、該做什麼」。
出門訣方案幫你補上「什麼時候做」—— 月度單盤 / 月度精選,把對的事放在對的時辰。</p>
<p><a href="${(ctx.siteUrl || 'https://jianyuan.life')}/pricing?utm_source=email&utm_medium=drip&utm_campaign=post_purchase_d14">看出門訣方案</a></p>`,
        ctx,
      ),
    },
  ]
}
