'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAdminAuth } from '../layout'
import { adminFetch } from '@/lib/admin-fetch'

const PLAN_NAMES: Record<string, string> = {
  C:'人生藍圖', D:'心之所惑', G15:'家族藍圖', R:'合否？',
  E1:'事件出門訣', E2:'月度出門訣',
}

type Promotion = {
  id: string; name: string; discount_percent: number
  start_at: string; end_at: string
  applicable_plans: string[] | null
  is_active: boolean; created_at: string
}

export default function PromotionsPage() {
  const { adminKey } = useAdminAuth()
  const [promotions, setPromotions] = useState<Promotion[]>([])
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    name: '', discount_percent: '',
    start_at: '', end_at: '',
    applicable_plans: [] as string[],
  })
  const [formError, setFormError] = useState('')

  const fetchPromotions = useCallback(async () => {
    if (!adminKey) return
    setLoading(true)
    try {
      const res = await adminFetch(`/api/admin/promotions`, { adminKey })
      if (res.ok) {
        const data = await res.json()
        setPromotions(data.promotions || [])
      }
    } finally { setLoading(false) }
  }, [adminKey])

  useEffect(() => { fetchPromotions() }, [fetchPromotions])

  const createPromotion = async () => {
    setFormError('')
    if (!form.name.trim()) { setFormError('促銷名稱不能為空'); return }
    const percent = Number(form.discount_percent)
    if (!percent || percent < 1 || percent > 99) { setFormError('折扣百分比必須在 1-99 之間'); return }
    if (!form.start_at || !form.end_at) { setFormError('必須設定開始與結束時間'); return }
    if (new Date(form.end_at) <= new Date(form.start_at)) { setFormError('結束時間必須晚於開始時間'); return }

    const res = await adminFetch(`/api/admin/promotions`, {
      adminKey,
      method: 'POST',
      body: JSON.stringify({
        name: form.name.trim(),
        discount_percent: percent,
        start_at: form.start_at,
        end_at: form.end_at,
        applicable_plans: form.applicable_plans.length > 0 ? form.applicable_plans : null,
      }),
    })
    if (res.ok) {
      setShowForm(false)
      setForm({ name: '', discount_percent: '', start_at: '', end_at: '', applicable_plans: [] })
      fetchPromotions()
    } else {
      const err = await res.json()
      setFormError(err.error || '建立失敗')
    }
  }

  const togglePromotion = async (id: string) => {
    await adminFetch(`/api/admin/promotions`, {
      adminKey,
      method: 'PATCH',
      body: JSON.stringify({ id, action: 'toggle' }),
    })
    fetchPromotions()
  }

  const deletePromotion = async (id: string) => {
    if (!confirm('確認刪除此促銷活動？')) return
    await adminFetch(`/api/admin/promotions`, {
      adminKey,
      method: 'PATCH',
      body: JSON.stringify({ id, action: 'delete' }),
    })
    fetchPromotions()
  }

  const togglePlan = (code: string) => {
    setForm(f => ({
      ...f,
      applicable_plans: f.applicable_plans.includes(code)
        ? f.applicable_plans.filter(p => p !== code)
        : [...f.applicable_plans, code],
    }))
  }

  const getStatus = (promo: Promotion) => {
    if (!promo.is_active) return { label: '已停用', color: 'bg-red-500/10 text-red-400' }
    const now = new Date()
    if (new Date(promo.start_at) > now) return { label: '未開始', color: 'bg-blue-500/10 text-blue-400' }
    if (new Date(promo.end_at) < now) return { label: '已結束', color: 'bg-gray-500/10 text-gray-400' }
    return { label: '進行中', color: 'bg-green-500/10 text-green-400' }
  }

  return (
    <div className="p-6 max-w-7xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">促銷活動</h1>
          <p className="text-xs text-gray-500">共 {promotions.length} 個促銷活動</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowForm(!showForm)}
            className="px-3 py-1.5 bg-amber-600 rounded-lg text-xs text-white hover:bg-amber-500">
            + 新增促銷
          </button>
          <button onClick={fetchPromotions} className="px-3 py-1.5 bg-white/5 rounded-lg text-xs text-gray-400 hover:bg-white/10">
            {loading ? '...' : '刷新'}
          </button>
        </div>
      </div>

      {/* 新增表單 */}
      {showForm && (
        <div className="bg-[#1a1a1a] rounded-xl border border-white/5 p-5 mb-4">
          <h3 className="text-sm font-semibold text-white mb-4">新增促銷活動</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">促銷名稱</label>
              <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="例：春季特惠"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">折扣百分比 (%)</label>
              <input type="number" min="1" max="99" value={form.discount_percent}
                onChange={e => setForm(f => ({ ...f, discount_percent: e.target.value }))}
                placeholder="例：20（表示打 8 折）"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">開始時間</label>
              <input type="datetime-local" value={form.start_at}
                onChange={e => setForm(f => ({ ...f, start_at: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">結束時間</label>
              <input type="datetime-local" value={form.end_at}
                onChange={e => setForm(f => ({ ...f, end_at: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none" />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-gray-500 mb-2 block">適用方案（不選=全部適用）</label>
              <div className="flex flex-wrap gap-2">
                {Object.entries(PLAN_NAMES).map(([code, name]) => (
                  <button key={code} type="button" onClick={() => togglePlan(code)}
                    className={`px-3 py-1 rounded-full text-xs transition-all ${form.applicable_plans.includes(code) ? 'bg-amber-500/30 text-amber-400 border border-amber-500/50' : 'bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10'}`}>
                    {name}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {formError && <p className="text-red-400 text-xs mt-3">{formError}</p>}
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => setShowForm(false)} className="px-4 py-2 text-xs text-gray-400 hover:text-white">取消</button>
            <button onClick={createPromotion} className="px-4 py-2 bg-amber-600 text-white rounded-lg text-xs hover:bg-amber-500">建立</button>
          </div>
        </div>
      )}

      {/* 促銷列表 */}
      <div className="space-y-2">
        {promotions.map(promo => {
          const status = getStatus(promo)
          return (
            <div key={promo.id} className={`bg-[#1a1a1a] rounded-xl border p-4 ${promo.is_active ? 'border-white/5' : 'border-white/5 opacity-50'}`}>
              <div className="flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-white font-bold">{promo.name}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400">
                      {promo.discount_percent}% 折扣
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${status.color}`}>
                      {status.label}
                    </span>
                  </div>
                  <div className="text-[10px] text-gray-500 mt-1 flex gap-3">
                    <span>{new Date(promo.start_at).toLocaleString('zh-TW')} ~ {new Date(promo.end_at).toLocaleString('zh-TW')}</span>
                    {promo.applicable_plans && (
                      <span>適用：{promo.applicable_plans.map(p => PLAN_NAMES[p] || p).join('、')}</span>
                    )}
                    {!promo.applicable_plans && <span>適用：全部方案</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => togglePromotion(promo.id)}
                    className={`px-3 py-1 rounded text-xs ${promo.is_active ? 'text-yellow-400 hover:bg-yellow-400/10' : 'text-green-400 hover:bg-green-400/10'}`}>
                    {promo.is_active ? '停用' : '啟用'}
                  </button>
                  <button onClick={() => deletePromotion(promo.id)}
                    className="px-3 py-1 rounded text-xs text-red-400 hover:bg-red-400/10">刪除</button>
                </div>
              </div>
            </div>
          )
        })}
        {promotions.length === 0 && (
          <div className="py-12 text-center text-gray-500 text-sm">暫無促銷活動</div>
        )}
      </div>
    </div>
  )
}
