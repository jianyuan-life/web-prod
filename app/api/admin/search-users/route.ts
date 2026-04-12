import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const ADMIN_KEY = process.env.ADMIN_KEY

// GET — 搜尋已註冊用戶（輸入時自動完成）
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key')
  const q = req.nextUrl.searchParams.get('q') || ''

  if (key !== ADMIN_KEY) {
    return NextResponse.json({ error: '無權限' }, { status: 403 })
  }
  if (q.length < 2) {
    return NextResponse.json({ users: [] })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  )

  const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 1000 })

  const query = q.toLowerCase()
  const matched = (users || [])
    .filter(u => {
      const email = (u.email || '').toLowerCase()
      const name = (u.user_metadata?.full_name || '').toLowerCase()
      return email.includes(query) || name.includes(query)
    })
    .slice(0, 8)
    .map(u => ({
      email: u.email,
      name: u.user_metadata?.full_name || '',
      id: u.id,
    }))

  return NextResponse.json({ users: matched })
}
