'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAdminAuth } from '../layout'

const PLAN_NAMES: Record<string, string> = {
  C:'人生藍圖', D:'心之所惑', G15:'家族藍圖', R:'合否？',
  E1:'事件出門訣', E2:'月盤出門訣',
}

type Coupon = {
  id: string; code: string; discount_type: string; discount_value: number
  applicable_products: string[] | null; max_uses: number | null
  used_count: number; is_active: boolean; valid_until: string | null
  note: string; created_at: string
}

export default function CouponsPage() {
  const { adminKey } = useAdminAuth()
  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    code: '', discount_type: 'percentage', discount_value: '',
    applicable_products: [] as string[], max_uses: '', valid_until: '', note: '',
  })
  const [formError, setFormError] = useState('')

  const fetchCoupons = useCallback(async () => {
    if (!adminKey) return
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/coupons?key=${adminKey}`)
      if (res.ok) {
        const data = await res.json()
        setCoupons(data.coupons || [])
      }
    } finally { setLoading(false) }
  }, [adminKey])

  useEffect(() => { fetchCoupons() }, [fetchCoupons])

  const createCoupon = async () => {
    setFormError('')
    if (!form.code.trim()) { setFormError('優惠碼不能為空'); return }
    const res = await fetch(`/api/admin/coupons?key=${adminKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        discount_value: Number(form.discount_value) || 0,
        max_uses: form.max_uses ? Number(form.max_uses) : null,
        valid_until: form.valid_until || null,
        applicable_products: form.applicable_products.length > 0 ? form.applicable_products : null,
      }),
    })
    if (res.ok) {
      setShowForm(false)
      setForm({ code: '', discount_type: 'percentage', discount_value: '', applicable_products: [], max_uses: '', valid_until: '', note: '' })
      fetchCoupons()
    } else {
      const err = await res.json()
      setFormError(err.error || '建立失敗')
    }
  }

  const toggleCoupon = async (id: string) => {
    await fetch(`/api/admin/coupons?key=${adminKey}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action: 'toggle' }),
    })
    fetchCoupons()
  }

  const deleteCoupon = async (id: string) => {
    if (!confirm('確認刪除此優惠碼？')) return
    await fetch(`/api/admin/coupons?key=${adminKey}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action: 'delete' }),
    })
    fetchCoupons()
  }

  const toggleProduct = (code: string) => {
    setForm(f => ({
      ...f,
      applicable_products: f.applicable_products.includes(code)
        ? f.applicable_products.filter(p => p !== code)
        : [...f.applicable_products, code],
    }))
  }

  return (
    <div className="p-6 max-w-7xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">優惠碼</h1>
          <p className="text-xs text-gray-500">共 {coupons.length} 組優惠碼</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowForm(!showForm)}
            className="px-3 py-1.5 bg-amber-600 rounded-lg text-xs text-white hover:bg-amber-500">
            + 新增優惠碼
          </button>
          <button onClick={fetchCoupons} className="px-3 py-1.5 bg-white/5 rounded-lg text-xs text-gray-400 hover:bg-white/10">
            {loading ? '...' : '刷新'}
          </button>
        </div>
      </div>

      {/* 新增表單 */}
      {showForm && (
        <div className="bg-[#1a1a1a] rounded-xl border border-white/5 p-5 mb-4">
          <h3 className="text-sm font-semibold text-white mb-4">新增優惠碼</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">優惠碼（留空自動生成）</label>
              <div className="flex gap-2">
                <input type="text" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                  placeholder="例：NEWYEAR2026"
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none" />
                <button type="button" onClick={() => {
                  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
                  const prefix = 'JY'
                  let code = prefix
                  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)]
                  setForm(f => ({ ...f, code }))
                }} className="px-3 py-2 bg-amber-600/20 border border-amber-600/30 rounded-lg text-xs text-amber-400 hover:bg-amber-600/30 whitespace-nowrap">
                  自動
                </button>
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">折扣類型</label>
              <select value={form.discount_type} onChange={e => setForm(f => ({ ...f, discount_type: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none">
                <option value="percentage">百分比折扣</option>
                <option value="fixed">固定金額折扣</option>
                <option value="free">完全免費</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">
                {form.discount_type === 'free' ? '完全免費（不需填寫）' : `折扣值 ${form.discount_type === 'percentage' ? '(%)' : '(USD)'}`}
              </label>
              <input type="number" value={form.discount_value} onChange={e => setForm(f => ({ ...f, discount_value: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">最大使用次數（空=無限）</label>
              <input type="number" value={form.max_uses} onChange={e => setForm(f => ({ ...f, max_uses: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">到期日（空=永不過期）</label>
              <input type="date" value={form.valid_until} onChange={e => setForm(f => ({ ...f, valid_until: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">備註</label>
              <input type="text" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500 focus:outline-none" />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-gray-500 mb-2 block">適用方案（不選=全部適用）</label>
              <div className="flex flex-wrap gap-2">
                {Object.entries(PLAN_NAMES).map(([code, name]) => (
                  <button key={code} type="button" onClick={() => toggleProduct(code)}
                    className={`px-3 py-1 rounded-full text-xs transition-all ${form.applicable_products.includes(code) ? 'bg-amber-500/30 text-amber-400 border border-amber-500/50' : 'bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10'}`}>
                    {name}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {formError && <p className="text-red-400 text-xs mt-3">{formError}</p>}
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => setShowForm(false)} className="px-4 py-2 text-xs text-gray-400 hover:text-white">取消</button>
            <button onClick={createCoupon} className="px-4 py-2 bg-amber-600 text-white rounded-lg text-xs hover:bg-amber-500">建立</button>
          </div>
        </div>
      )}

      {/* 優惠碼列表 */}
      <div className="space-y-2">
        {coupons.map(coupon => (
          <div key={coupon.id} className={`bg-[#1a1a1a] rounded-xl border p-4 ${coupon.is_active ? 'border-white/5' : 'border-white/5 opacity-50'}`}>
            <div className="flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-white font-mono font-bold">{coupon.code}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400">
                    {coupon.discount_type === 'free' ? '免費' : coupon.discount_type === 'percentage' ? `${coupon.discount_value}%` : `$${coupon.discount_value}`}
                  </span>
                  {!coupon.is_active && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/10 text-red-400">已停用</span>
                  )}
                </div>
                <div className="text-[10px] text-gray-500 mt-1 flex gap-3">
                  <span>使用 {coupon.used_count}{coupon.max_uses ? `/${coupon.max_uses}` : ''} 次</span>
                  {coupon.applicable_products && (
                    <span>適用：{coupon.applicable_products.map(p => PLAN_NAMES[p] || p).join('、')}</span>
                  )}
                  {coupon.valid_until && <span>到期：{new Date(coupon.valid_until).toLocaleDateString('zh-TW')}</span>}
                  {coupon.note && <span>{coupon.note}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => toggleCoupon(coupon.id)}
                  className={`px-3 py-1 rounded text-xs ${coupon.is_active ? 'text-yellow-400 hover:bg-yellow-400/10' : 'text-green-400 hover:bg-green-400/10'}`}>
                  {coupon.is_active ? '停用' : '啟用'}
                </button>
                <button onClick={() => deleteCoupon(coupon.id)}
                  className="px-3 py-1 rounded text-xs text-red-400 hover:bg-red-400/10">刪除</button>
              </div>
            </div>
          </div>
        ))}
        {coupons.length === 0 && (
          <div className="py-12 text-center text-gray-500 text-sm">暫無優惠碼</div>
        )}
      </div>
    </div>
  )
}
