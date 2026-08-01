import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const body = await request.json();
    const email = body?.email;

    if (!email) {
      return NextResponse.json(
        { ok: false, error: 'email gerekli' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: 'Test bildirimi API isteği başarıyla alındı.',
      email,
      note: 'Bu endpoint şu anda test bağlantısını doğrular.'
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error?.message || 'Bilinmeyen hata'
      },
      { status: 500 }
    );
  }
}
