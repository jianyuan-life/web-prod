import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthUserId } from '@/lib/auth-helper'

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  )
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
    return NextResponse.json({ error: error.message }, { status: 500 })
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
  if (!name?.trim()) {
    return NextResponse.json({ error: '姓名不能為空' }, { status: 400 })
  }
  if (!['M', 'F'].includes(gender)) {
    return NextResponse.json({ error: '性別格式錯誤' }, { status: 400 })
  }
  if (!year || !month || !day) {
    return NextResponse.json({ error: '出生日期不完整' }, { status: 400 })
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
      year: parseInt(year),
      month: parseInt(month),
      day: parseInt(day),
      hour: parseInt(hour) || 12,
      minute: parseInt(minute) || 0,
      time_mode: time_mode || 'shichen',
      calendar_type: calendar_type || 'solar',
      lunar_leap: lunar_leap || false,
      birth_city: birth_city || '',
      city_lat: city_lat || 0,
      city_lng: city_lng || 0,
      city_tz: city_tz ?? 8,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ member: data })
}
