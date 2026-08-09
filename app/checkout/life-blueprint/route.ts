import { NextResponse } from 'next/server'

export function GET(request: Request) {
  return NextResponse.redirect(new URL('/checkout?plan=C', request.url), 307)
}
