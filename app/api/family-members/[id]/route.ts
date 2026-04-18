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

  if (name !== undefined && !name?.trim()) {
    return NextResponse.json({ error: '姓名不能為空' }, { status: 400 })
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
  if (year !== undefined) updates.year = parseInt(year)
  if (month !== undefined) updates.month = parseInt(month)
  if (day !== undefined) updates.day = parseInt(day)
  if (hour !== undefined) updates.hour = parseInt(hour)
  if (minute !== undefined) updates.minute = parseInt(minute)
  if (time_mode !== undefined) updates.time_mode = time_mode
  if (calendar_type !== undefined) updates.calendar_type = calendar_type
  if (lunar_leap !== undefined) updates.lunar_leap = lunar_leap
  if (birth_city !== undefined) updates.birth_city = birth_city
  if (city_lat !== undefined) updates.city_lat = city_lat
  if (city_lng !== undefined) updates.city_lng = city_lng
  if (city_tz !== undefined) updates.city_tz = city_tz

  const { data, error } = await supabase
    .from('family_members')
    .update(updates)
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
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
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
