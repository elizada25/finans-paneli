import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function getFirebaseAdmin() {
  const { cert, getApps, initializeApp } = await import('firebase-admin/app');
  const { getAuth } = await import('firebase-admin/auth');
  const { getFirestore } = await import('firebase-admin/firestore');
  const { getMessaging } = await import('firebase-admin/messaging');

  if (getApps().length === 0) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;

    if (!raw) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_BASE64 bulunamadı.');
    }

    const serviceAccount = JSON.parse(
      Buffer.from(raw, 'base64').toString('utf8')
    );

    initializeApp({
      credential: cert(serviceAccount),
    });
  }

  return {
    auth: getAuth(),
    db: getFirestore(),
    messaging: getMessaging(),
  };
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

    const { auth, db, messaging } = await getFirebaseAdmin();

    let firebaseUser;

    try {
      firebaseUser = await auth.getUserByEmail(email);
    } catch (error) {
      return NextResponse.json({
        ok: false,
        error: 'Firebase Authentication kullanıcısı bulunamadı.',
        email,
        detail: error?.message || 'Kullanıcı bulunamadı.',
      });
    }

    const userId = firebaseUser.uid;

    const devicesSnapshot = await db
      .collection('users')
      .doc(userId)
      .collection('notificationDevices')
      .where('enabled', '==', true)
      .get();

    const devices = devicesSnapshot.docs
      .map((item) => ({
        id: item.id,
        ...item.data(),
      }))
      .filter((device) => device.token);

    if (devices.length === 0) {
      return NextResponse.json({
        ok: false,
        error: 'Firebase Auth kullanıcısı bulundu ancak aktif bildirim cihazı bulunamadı.',
        email,
        userId,
        devices: 0,
      });
    }

    const tokens = devices.map((device) => device.token);

    const response = await messaging.sendEachForMulticast({
      tokens,
      notification: {
        title: '🔔 SKY FİNANS TEST',
        body: 'Gerçek test bildirimi başarıyla gönderildi.',
      },
      data: {
        type: 'test',
        url: '/senkron-panel',
        timestamp: String(Date.now()),
      },
      webpush: {
        notification: {
          title: '🔔 SKY FİNANS TEST',
          body: 'Gerçek test bildirimi başarıyla gönderildi.',
          icon: '/icon-192.png',
          badge: '/icon-192.png',
          requireInteraction: true,
        },
        fcmOptions: {
          link: '/senkron-panel',
        },
      },
    });

    return NextResponse.json({
      ok: true,
      message: 'Gerçek FCM test bildirimi gönderildi.',
      email,
      userId,
      devices: devices.length,
      success: response.successCount,
      failed: response.failureCount,
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
