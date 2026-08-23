import { NextResponse } from 'next/server';
import {
  cert,
  getApps,
  initializeApp,
} from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

export const dynamic = 'force-dynamic';

function getAdminApp() {
  if (getApps().length) return getApps()[0];

  const encoded =
    process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;

  if (!encoded) {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT_BASE64 eksik.'
    );
  }

  const serviceAccount = JSON.parse(
    Buffer.from(encoded, 'base64').toString('utf8')
  );

  return initializeApp({
    credential: cert(serviceAccount),
  });
}

export async function GET(request) {
  try {
    const expected =
      process.env.ALERT_CRON_SECRET;

    if (
      !expected ||
      request.headers.get('authorization') !==
        `Bearer ${expected}`
    ) {
      return NextResponse.json(
        { ok: false, error: 'Yetkisiz erişim.' },
        { status: 401 }
      );
    }

    getAdminApp();

    const db = getFirestore();
    const messaging = getMessaging();
    const users = await db.collection('users').get();
    const tokens = [];

    for (const user of users.docs) {
      const devices = await user.ref
        .collection('notificationDevices')
        .where('enabled', '==', true)
        .get();

      for (const device of devices.docs) {
        const token = device.data()?.token;
        if (token) tokens.push(token);
      }
    }

    const uniqueTokens = [...new Set(tokens)].slice(0, 500);

    if (!uniqueTokens.length) {
      return NextResponse.json({
        ok: false,
        error: 'Aktif bildirim cihazı bulunamadı.',
      });
    }

    const targetUrl =
      'https://www.reuters.com/markets/';

    const result =
      await messaging.sendEachForMulticast({
        tokens: uniqueTokens,
        notification: {
          title: '📰 HABER BAĞLANTI TESTİ',
          body:
            'Bu bildirime dokununca Reuters açılmalıdır.',
        },
        data: {
          type: 'news-test',
          url: targetUrl,
          newsUrl: targetUrl,
        },
        webpush: {
          fcmOptions: {
            link: targetUrl,
          },
          notification: {
            title: '📰 HABER BAĞLANTI TESTİ',
            body:
              'Bu bildirime dokununca Reuters açılmalıdır.',
            icon: '/icon-192.png',
            badge: '/icon-192.png',
            requireInteraction: true,
            data: {
              url: targetUrl,
              newsUrl: targetUrl,
            },
          },
        },
      });

    return NextResponse.json({
      ok: true,
      devices: uniqueTokens.length,
      sent: result.successCount,
      failed: result.failureCount,
    });
  } catch (error) {
    console.error(
      'Haber bağlantı testi hatası:',
      error
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          error?.message || 'Bilinmeyen hata',
      },
      { status: 500 }
    );
  }
}
