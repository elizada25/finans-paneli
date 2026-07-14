import { NextResponse } from 'next/server';
import { makeToken } from '../../../lib-auth';

export async function POST(request) {
  const { username, password } = await request.json();
  const expectedUser = process.env.APP_USERNAME;
  const expectedPass = process.env.APP_PASSWORD;
  const secret = process.env.AUTH_SECRET;

  if (!expectedUser || !expectedPass || !secret) {
    return NextResponse.json({ error: 'Sunucu ayarları eksik' }, { status: 500 });
  }
  if (username !== expectedUser || password !== expectedPass) {
    return NextResponse.json({ error: 'Hatalı giriş' }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set('finance_auth', makeToken(username, secret), {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30
  });
  return response;
}
