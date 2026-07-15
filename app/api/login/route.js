import { NextResponse } from 'next/server';
import { makeToken } from '../../../lib-auth';

export async function POST(request) {
  try {
    const { idToken } = await request.json();

    const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
    const secret = process.env.AUTH_SECRET;

    if (!idToken) {
      return NextResponse.json(
        { error: 'Firebase kimlik bilgisi eksik.' },
        { status: 400 }
      );
    }

    if (!apiKey || !secret) {
      return NextResponse.json(
        { error: 'Sunucu ayarları eksik.' },
        { status: 500 }
      );
    }

    const firebaseResponse = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ idToken }),
        cache: 'no-store',
      }
    );

    if (!firebaseResponse.ok) {
      const firebaseError = await firebaseResponse.json().catch(() => ({}));
      console.error('Firebase doğrulama hatası:', firebaseError);

      return NextResponse.json(
        { error: 'Firebase oturumu doğrulanamadı.' },
        { status: 401 }
      );
    }

    const firebaseData = await firebaseResponse.json();
    const firebaseUser = firebaseData.users?.[0];

    if (!firebaseUser?.localId) {
      return NextResponse.json(
        { error: 'Firebase kullanıcısı bulunamadı.' },
        { status: 401 }
      );
    }

    const identity = firebaseUser.email || firebaseUser.localId;

    const response = NextResponse.json({
      ok: true,
      uid: firebaseUser.localId,
      email: firebaseUser.email || null,
    });

    response.cookies.set(
      'finance_auth',
      makeToken(identity, secret),
      {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 30,
      }
    );

    return response;
  } catch (error) {
    console.error('Login API error:', error);

    return NextResponse.json(
      { error: 'Giriş sırasında sunucu hatası oluştu.' },
      { status: 500 }
    );
  }
}