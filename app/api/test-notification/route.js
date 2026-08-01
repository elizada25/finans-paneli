import { NextResponse } from 'next/server';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

export const dynamic = 'force-dynamic';

function getFirebaseAdmin() {
  if (getApps().length > 0) {
    return getApps()[0];
  }

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;

  if (!raw) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_BASE64 bulunamadı.');
  }

  const serviceAccount = JSON.parse(
    Buffer.from(raw, 'base64').toString('utf8')
  );

  return initializeApp({
    credential: cert(serviceAccount),
  });
}

export async function POST(request) {
  try {
    const body = await request.json();
    const email = String(body?.email || '').trim().toLowerCase();

    if (!email) {
      return NextResponse.json(
        { ok: false, error: 'email gerekli' },
        { status: 400 }
      );
    }

    getFirebaseAdmin();

    const db = getFirestore();
    const messaging = getMessaging();

    const usersSnapshot = await db
      .collection('users')
      .where('email', '==', email)
      .limit(1)
      .get();

    if (usersSnapshot.empty) {
      return NextResponse.json({
        ok: false,
        error: 'Bu email adresine ait Firebase kullanıcısı bulunamadı.',
        email,
      });
    }

    const userDoc = usersSnapshot.docs[0];

    const devicesSnapshot = await db
      .collection('users')
      .doc(userDoc.id)
      .collection('notificationDevices')
      .where('enabled', '==', true)
      .get();

    const devices = devicesSnapshot.docs
      .map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }))
      .filter((device) => device.token);

    if (devices.length === 0) {
      return NextResponse.json({
        ok: false,
        error: 'Aktif bildirim cihazı bulunamadı.',
        email,
        userId: userDoc.id,
        devices: 0,
      });
    }

    const tokens = devices.map((device) => device.token);

    const response = await messaging.sendEachForMulticast({
      tokens,
      notification: {
        title: '🔔 SKY FİNANS TEST',
        body: 'Bildirim sistemi başarıyla çalışıyor. Bu gerçek bir test bildirimidir.',
      },
      data: {
        type: 'test',
        url: '/senkron-panel',
        timestamp: String(Date.now()),
      },
      webpush: {
        notification: {
          title: '🔔 SKY FİNANS TEST',
          body: 'Bildirim sistemi başarıyla çalışıyor. Bu gerçek bir test bildirimidir.',
          icon: '/icon-192.png',
          badge: '/icon-192.png',
          requireInteraction: true,
        },
        fcmOptions: {
          link: '/senkron-panel',
        },
      },
    });

    let removed = 0;

    for (let i = 0; i < response.responses.length; i++) {
      const result = response.responses[i];

      if (!result.success) {
        const code = result.error?.code || '';

        if (
          code.includes('registration-token-not-registered') ||
          code.includes('invalid-registration-token')
        ) {
          await db
            .collection('users')
            .doc(userDoc.id)
            .collection('notificationDevices')
            .doc(devices[i].id)
            .set(
              {
                enabled: false,
                disabledReason: code,
              },
              { merge: true }
            );

          removed++;
        }
      }
    }

    return NextResponse.json({
      ok: true,
      message: 'Gerçek test bildirimi gönderme işlemi tamamlandı.',
      email,
      devices: devices.length,
      success: response.successCount,
      failed: response.failureCount,
      disabled: removed,
    });
  } catch (error) {
    console.error('Test notification error:', error);

    return NextResponse.json(
      {
        ok: false,
        error: error?.message || 'Bilinmeyen hata',
      },
      { status: 500 }
    );
  }
}
