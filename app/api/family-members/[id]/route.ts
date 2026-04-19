import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthUserId } from '@/lib/auth-helper'

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  )
}

// PATCH — 更新家人資料
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getAuthUserId(req)
  if (!userId) {
    return NextResponse.json({ error: '請先登入' }, { status: 401 })
  }

  const { id } = await params
  const body = await req.json()
  const { name, gender, year, month, day, hour, minute, time_mode, calendar_type, lunar_leap, birth_city, city_lat, city_lng, city_tz } = body

  if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
    return NextResponse.json({ error: '姓名不能為空' }, { status: 400 })
  }
  if (typeof name === 'string' && name.trim().length > 50) {
    return NextResponse.json({ error: '姓名最多 50 字' }, { status: 400 })
  }
  if (gender !== undefined && !['M', 'F'].includes(gender)) {
    return NextResponse.json({ error: '性別格式錯誤' }, { status: 400 })
  }

  // v5.3.34：範圍驗證（跟 POST 一致）
  const parseIntInRange = (v: unknown, min: number, max: number): number | null => {
    const n = typeof v === 'number' ? v : parseInt(String(v), 10)
    if (!Number.isFinite(n) || !Number.isInteger(n)) return null
    if (n < min || n > max) return null
    return n
  }
  const validations: Array<[unknown, number, number, string]> = [
    [year, 1900, 2100, '年'],
    [month, 1, 12, '月'],
    [day, 1, 31, '日'],
    [hour, 0, 23, '時'],
    [minute, 0, 59, '分'],
  ]
  for (const [val, min, max, label] of validations) {
    if (val !== undefined && parseIntInRange(val, min, max) === null) {
      return NextResponse.json({ error: `${label}超出範圍（${min}-${max}）` }, { status: 400 })
    }
  }
  if (city_lat !== undefined && (!Number.isFinite(Number(city_lat)) || Math.abs(Number(city_lat)) > 90)) {
    return NextResponse.json({ error: '緯度超出範圍' }, { status: 400 })
  }
  if (city_lng !== undefined && (!Number.isFinite(Number(city_lng)) || Math.abs(Number(city_lng)) > 180)) {
    return NextResponse.json({ error: '經度超出範圍' }, { status: 400 })
  }
  if (city_tz !== undefined) {
    const tz = Number(city_tz)
    if (!Number.isFinite(tz) || tz < -12 || tz > 14) {
      return NextResponse.json({ error: '時區超出範圍' }, { status: 400 })
    }
  }

  const supabase = getServiceSupabase()

  // 確認是自己的家人
  const { data: existing } = await supabase
    .from('family_members')
    .select('id')
    .eq('id', id)
    .eq('user_id', userId)
    .single()

  if (!existing) {
    return NextResponse.json({ error: '找不到此家人資料' }, { status: 404 })
  }

  // 只更新有提供的欄位
  const updates: Record<string, unknown> = {}
  if (name !== undefined) updates.name = name.trim()
  if (gender !== undefined) updates.gender = gender
  if (year !== undefined) updates.year = parseIntInRange(year, 1900, 2100)
  if (month !== undefined) updates.month = parseIntInRange(month, 1, 12)
  if (day !== undefined) updates.day = parseIntInRange(day, 1, 31)
  if (hour !== undefined) updates.hour = parseIntInRange(hour, 0, 23)
  if (minute !== undefined) updates.minute = parseIntInRange(minute, 0, 59)
  if (time_mode !== undefined) updates.time_mode = time_mode
  if (calendar_type !== undefined) updates.calendar_type = calendar_type
  if (lunar_leap !== undefined) updates.lunar_leap = lunar_leap
  if (birth_city !== undefined) updates.birth_city = typeof birth_city === 'string' ? birth_city.slice(0, 100) : ''
  if (city_lat !== undefined) updates.city_lat = Number(city_lat)
  if (city_lng !== undefined) updates.city_lng = Number(city_lng)
  if (city_tz !== undefined) updates.city_tz = Number(city_tz)

  const { data, error } = await supabase
    .from('family_members')
    .update(updates)
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single()

  if (error) {
    console.error('[family-members PATCH] DB error:', error.message)
    return NextResponse.json({ error: '更新失敗' }, { status: 500 })
  }

  return NextResponse.json({ member: data })
}

// DELETE — 刪除家人
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getAuthUserId(req)
  if (!userId) {
    return NextResponse.json({ error: '請先登入' }, { status: 401 })
  }

  const { id } = await params
  const supabase = getServiceSupabase()

  const { error } = await supabase
    .from('family_members')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)

  if (error) {
    console.error('[family-members DELETE] DB error:', error.message)
    return NextResponse.json({ error: '刪除失敗' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
