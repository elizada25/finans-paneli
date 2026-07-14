import { NextResponse } from 'next/server';

async function verify(token, secret) {
  try {
    const [payload, sig] = token.split('.');
    if (!payload || !sig) return false;
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const signature = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
    const expected = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    if (expected !== sig) return false;
    const data = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return data.exp > Date.now();
  } catch {
    return false;
  }
}

export async function middleware(request) {
  const token = request.cookies.get('finance_auth')?.value;
  const ok = token && process.env.AUTH_SECRET && await verify(token, process.env.AUTH_SECRET);
  if (!ok) {
    const url = new URL('/login', request.url);
    url.searchParams.set('next', request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/panel.html']
};
