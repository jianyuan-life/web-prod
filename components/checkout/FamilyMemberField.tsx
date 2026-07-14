'use client'

import BirthTimeField from './BirthTimeField'
import { type FamilyMember } from './types'

interface FamilyMemberFieldProps {
  index: number
  member: FamilyMember
  canDelete: boolean
  onChange: (updated: FamilyMember) => void
  onDelete: () => void
}

export default function FamilyMemberField({ index, member, canDelete, onChange, onDelete }: FamilyMemberFieldProps) {
  return (
    <section className="border border-gold/20 rounded-xl p-4 space-y-3 bg-white/3" aria-labelledby={`family-member-${index}-heading`}>
      <div className="flex justify-between items-center">
        <h3 id={`family-member-${index}-heading`} className="text-sm font-semibold text-gold">第 {index + 1} 位成員</h3>
        {canDelete && (
          <button type="button" onClick={onDelete}
            className="text-xs text-red-400 hover:text-red-300 border border-red-400/30 rounded px-2 py-0.5">
            移除
          </button>
        )}
      </div>

      {/* 姓名 */}
      <div>
        <label htmlFor={`family-member-${index}-name`} className="block text-xs text-text-muted mb-1">姓名 *</label>
        <input id={`family-member-${index}-name`} type="text" required placeholder="請輸入姓名"
          value={member.name}
          onChange={(e) => onChange({ ...member, name: e.target.value })}
          className="w-full bg-white/5 border border-gold/10 rounded-lg px-4 py-2.5 text-cream focus:border-gold/40 focus:outline-none text-sm"
        />
      </div>

      {/* 出生年月日 */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label htmlFor={`family-member-${index}-year`} className="block text-xs text-text-muted mb-1">出生年</label>
          <input id={`family-member-${index}-year`} type="number" min="1920" max="2030"
            value={member.year}
            onChange={(e) => onChange({ ...member, year: e.target.value })}
            className="w-full bg-white/5 border border-gold/10 rounded-lg px-3 py-2.5 text-white text-sm focus:border-gold focus:outline-none"
          />
        </div>
        <div>
          <label htmlFor={`family-member-${index}-month`} className="block text-xs text-text-muted mb-1">月</label>
          <select id={`family-member-${index}-month`} value={member.month} onChange={(e) => onChange({ ...member, month: e.target.value })}
            className="w-full bg-white/5 border border-gold/10 rounded-lg px-3 py-2.5 text-white text-sm focus:border-gold focus:outline-none">
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={i + 1}>{i + 1}月</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`family-member-${index}-day`} className="block text-xs text-text-muted mb-1">日</label>
          <select id={`family-member-${index}-day`} value={member.day} onChange={(e) => onChange({ ...member, day: e.target.value })}
            className="w-full bg-white/5 border border-gold/10 rounded-lg px-3 py-2.5 text-white text-sm focus:border-gold focus:outline-none">
            {Array.from({ length: 31 }, (_, i) => (
              <option key={i + 1} value={i + 1}>{i + 1}日</option>
            ))}
          </select>
        </div>
      </div>

      {/* 性別 */}
      <fieldset>
        <legend className="block text-xs text-text-muted mb-1">性別 *</legend>
        <div className="flex gap-6">
          {[{ v: 'M', l: '男' }, { v: 'F', l: '女' }].map(({ v, l }) => (
            <label key={v} className="checkout-choice flex items-center gap-2 cursor-pointer">
              <input type="radio" name={`gender-${index}`} value={v} checked={member.gender === v}
                onChange={() => onChange({ ...member, gender: v })} className="accent-gold" />
              <span className="text-sm text-text">{l}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {/* 出生時間 */}
      <BirthTimeField
        timeMode={member.timeMode}
        setTimeMode={(m) => onChange({ ...member, timeMode: m })}
        hour={member.hour}
        minute={member.minute}
        idPrefix={`family-member-${index}-time`}
        onChange={(field, val) => onChange({ ...member, [field]: val })}
      />
    </section>
  )
}
