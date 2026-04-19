import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthUserId } from '@/lib/auth-helper'

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  )
}

// 範圍驗證：回傳 number 或 null（null 代表無效）
function parseIntInRange(v: unknown, min: number, max: number): number | null {
  const n = typeof v === 'number' ? v : parseInt(String(v), 10)
  if (!Number.isFinite(n) || !Number.isInteger(n)) return null
  if (n < min || n > max) return null
  return n
}

// GET — 取得用戶的所有家人
export async function GET(req: NextRequest) {
  const userId = await getAuthUserId(req)
  if (!userId) {
    return NextResponse.json({ error: '請先登入' }, { status: 401 })
  }

  const supabase = getServiceSupabase()
  const { data, error } = await supabase
    .from('family_members')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[family-members GET] DB error:', error.message)
    return NextResponse.json({ error: '查詢失敗' }, { status: 500 })
  }

  return NextResponse.json({ members: data || [] })
}

// POST — 新增家人
export async function POST(req: NextRequest) {
  const userId = await getAuthUserId(req)
  if (!userId) {
    return NextResponse.json({ error: '請先登入' }, { status: 401 })
  }

  const body = await req.json()
  const { name, gender, year, month, day, hour, minute, time_mode, calendar_type, lunar_leap, birth_city, city_lat, city_lng, city_tz } = body

  // 基本驗證
  if (typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: '姓名不能為空' }, { status: 400 })
  }
  if (name.trim().length > 50) {
    return NextResponse.json({ error: '姓名最多 50 字' }, { status: 400 })
  }
  if (!['M', 'F'].includes(gender)) {
    return NextResponse.json({ error: '性別格式錯誤' }, { status: 400 })
  }

  // 範圍驗證（v5.3.34）
  const pYear = parseIntInRange(year, 1900, 2100)
  const pMonth = parseIntInRange(month, 1, 12)
  const pDay = parseIntInRange(day, 1, 31)
  // hour=0（子時）必須允許，所以不能用 `|| 12`
  const pHour = hour === undefined || hour === null ? 12 : parseIntInRange(hour, 0, 23)
  const pMinute = minute === undefined || minute === null ? 0 : parseIntInRange(minute, 0, 59)
  if (pYear === null || pMonth === null || pDay === null) {
    return NextResponse.json({ error: '出生日期超出範圍（年 1900-2100 / 月 1-12 / 日 1-31）' }, { status: 400 })
  }
  if (pHour === null || pMinute === null) {
    return NextResponse.json({ error: '出生時辰超出範圍' }, { status: 400 })
  }
  // 座標與時區範圍
  const pLat = city_lat === undefined || city_lat === null ? 0 : Number(city_lat)
  const pLng = city_lng === undefined || city_lng === null ? 0 : Number(city_lng)
  const pTz = city_tz === undefined || city_tz === null ? 8 : Number(city_tz)
  if (!Number.isFinite(pLat) || pLat < -90 || pLat > 90) {
    return NextResponse.json({ error: '緯度超出範圍' }, { status: 400 })
  }
  if (!Number.isFinite(pLng) || pLng < -180 || pLng > 180) {
    return NextResponse.json({ error: '經度超出範圍' }, { status: 400 })
  }
  if (!Number.isFinite(pTz) || pTz < -12 || pTz > 14) {
    return NextResponse.json({ error: '時區超出範圍' }, { status: 400 })
  }

  const supabase = getServiceSupabase()

  // 檢查數量限制（trigger 也會擋，但先在 API 層給友善訊息）
  const { count } = await supabase
    .from('family_members')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)

  if ((count ?? 0) >= 20) {
    return NextResponse.json({ error: '每位用戶最多儲存 20 位家人' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('family_members')
    .insert({
      user_id: userId,
      name: name.trim(),
      gender,
      year: pYear,
      month: pMonth,
      day: pDay,
      hour: pHour,
      minute: pMinute,
      time_mode: time_mode || 'shichen',
      calendar_type: calendar_type || 'solar',
      lunar_leap: lunar_leap || false,
      birth_city: typeof birth_city === 'string' ? birth_city.slice(0, 100) : '',
      city_lat: pLat,
      city_lng: pLng,
      city_tz: pTz,
    })
    .select()
    .single()

  if (error) {
    console.error('[family-members POST] DB error:', error.message)
    return NextResponse.json({ error: '新增家人失敗' }, { status: 500 })
  }

  return NextResponse.json({ member: data })
}
