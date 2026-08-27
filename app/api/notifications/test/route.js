import { NextResponse } from 'next/server';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function getAdminApp() {
  if (getApps().length) return getApps()[0];
  const encoded = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (!encoded || encoded === '[SENSITIVE]') {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_BASE64 eksik.');
  }
  return initializeApp({
    credential: cert(
      JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'))
    ),
  });
}

export async function POST(request) {
  try {
    const authorization = request.headers.get('authorization') || '';
    const idToken = authorization.startsWith('Bearer ')
      ? authorization.slice(7)
      : '';
    if (!idToken) {
      return NextResponse.json(
        { ok: false, error: 'Oturum doğrulaması bulunamadı.' },
        { status: 401 }
      );
    }

    getAdminApp();
    const decoded = await getAuth().verifyIdToken(idToken);
    const body = await request.json();
    const deviceId = String(body?.deviceId || '').trim();
    const token = String(body?.token || '').trim();
    if (!deviceId || !token) {
      return NextResponse.json(
        { ok: false, error: 'Cihaz bilgisi eksik.' },
        { status: 400 }
      );
    }

    const deviceRef = getFirestore()
      .collection('users')
      .doc(decoded.uid)
      .collection('notificationDevices')
      .doc(deviceId);
    const deviceSnapshot = await deviceRef.get();
    const device = deviceSnapshot.data();
    if (!deviceSnapshot.exists || !device?.enabled || device?.token !== token) {
      return NextResponse.json(
        { ok: false, error: 'Cihaz kaydı doğrulanamadı.' },
        { status: 403 }
      );
    }

    const result = await getMessaging().sendEachForMulticast({
      tokens: [token],
      data: {
        title: '✅ SKY FİNANS BİLDİRİM TESTİ',
        body: 'Mobil bildirim bağlantınız yenilendi ve çalışıyor.',
        type: 'mobile-registration-test',
        url: '/senkron-panel',
        timestamp: String(Date.now()),
      },
      webpush: {
        headers: { Urgency: 'high', TTL: '300' },
        fcmOptions: {
          link: `${process.env.APP_URL || new URL(request.url).origin}/senkron-panel`,
        },
      },
    });

    const failure = result.responses.find((item) => !item.success)?.error;
    if (result.successCount !== 1) {
      await deviceRef.set(
        {
          enabled: false,
          lastError: failure?.code || failure?.message || 'Gönderim başarısız',
          lastTestAt: new Date().toISOString(),
        },
        { merge: true }
      );
      return NextResponse.json(
        {
          ok: false,
          sent: 0,
          failed: result.failureCount,
          error: failure?.message || 'Firebase bildirimi kabul etmedi.',
        },
        { status: 502 }
      );
    }

    await deviceRef.set(
      {
        lastTestAt: new Date().toISOString(),
        lastTestSuccess: true,
        lastError: null,
      },
      { merge: true }
    );
    return NextResponse.json({ ok: true, sent: 1, failed: 0 });
  } catch (error) {
    console.error('Mobil bildirim test hatası:', error);
    return NextResponse.json(
      { ok: false, error: error?.message || 'Bildirim testi yapılamadı.' },
      { status: 500 }
    );
  }
}
