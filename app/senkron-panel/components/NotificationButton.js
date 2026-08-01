'use client';

import { useEffect, useState } from 'react';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { getMessaging, getToken, isSupported } from 'firebase/messaging';
import { firebaseApp, firestoreDb } from '../../../lib-firebase';

const STORAGE_KEY = 'sky-finans-bildirimler-acik';

export default function NotificationButton({ user }) {
  const [status, setStatus] = useState('checking');

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const localActive =
      localStorage.getItem(STORAGE_KEY) === 'true';

    const permissionGranted =
      'Notification' in window &&
      Notification.permission === 'granted';

    if (localActive || permissionGranted) {
      setStatus('hidden');
    } else {
      setStatus('idle');
    }
  }, []);

  async function activateNotifications() {
    try {
      setStatus('loading');

      if (!user?.uid) {
        throw new Error(
          'Önce Sky Finans hesabına giriş yapmalısınız.'
        );
      }

      const supported = await isSupported();

      if (!supported) {
        throw new Error(
          'Bu cihaz bildirim sistemini desteklemiyor.'
        );
      }

      if (!('serviceWorker' in navigator)) {
        throw new Error(
          'Bu cihaz Service Worker desteği sunmuyor.'
        );
      }

      if (!('Notification' in window)) {
        throw new Error(
          "Bildirim desteği bulunamadı. iPhone'da Sky Finans'ı ana ekrandan açın."
        );
      }

      let permission = Notification.permission;

      if (permission !== 'granted') {
        permission =
          await Notification.requestPermission();
      }

      if (permission !== 'granted') {
        throw new Error(
          'Bildirim izni verilmedi.'
        );
      }

      const vapidKey =
        process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;

      if (!vapidKey) {
        throw new Error(
          'Firebase VAPID anahtarı bulunamadı.'
        );
      }

      const registration =
        await navigator.serviceWorker.register(
          '/firebase-messaging-sw.js'
        );

      await navigator.serviceWorker.ready;

      const messaging =
        getMessaging(firebaseApp);

      const token = await getToken(
        messaging,
        {
          vapidKey,
          serviceWorkerRegistration:
            registration,
        }
      );

      if (!token) {
        throw new Error(
          'Bildirim anahtarı oluşturulamadı.'
        );
      }

      const deviceId =
        await createDeviceId(token);

      await setDoc(
        doc(
          firestoreDb,
          'users',
          user.uid,
          'notificationDevices',
          deviceId
        ),
        {
          token,
          enabled: true,
          platform: detectPlatform(),
          userAgent: navigator.userAgent,
          updatedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
        },
        {
          merge: true,
        }
      );

      // Bu cihazda bildirim sistemi artık aktif.
      // Sayfa kapatılıp açılsa bile panel tekrar görünmez.
      localStorage.setItem(
        STORAGE_KEY,
        'true'
      );

      // Paneli tamamen kaldır.
      setStatus('hidden');

    } catch (error) {
      console.error(
        'Sky bildirim hatası:',
        error
      );

      setStatus('idle');
    }
  }

  // Bildirimler daha önce açıldıysa hiçbir şey gösterme.
  if (
    status === 'hidden' ||
    status === 'checking'
  ) {
    return null;
  }

  return (
    <div
      style={{
        padding: '14px',
        marginBottom: '16px',
        borderRadius: '14px',
        background:
          'rgba(255,255,255,0.06)',
        border:
          '1px solid rgba(212,175,55,0.32)',
      }}
    >
      <div
        style={{
          fontWeight: 800,
          fontSize: '15px',
          marginBottom: '5px',
        }}
      >
        🔔 Sky Bildirimleri
      </div>

      <div
        style={{
          opacity: 0.72,
          fontSize: '12px',
          marginBottom: '11px',
        }}
      >
        Fiyat alarmı ve önemli gelişmeleri
        iPhone&apos;undan takip et.
      </div>

      <button
        type="button"
        onClick={activateNotifications}
        disabled={
          status === 'loading'
        }
        style={{
          width: '100%',
          minHeight: '44px',
          border: 0,
          borderRadius: '10px',
          fontWeight: 800,
          fontSize: '14px',
          cursor:
            status === 'loading'
              ? 'default'
              : 'pointer',
          background:
            status === 'loading'
              ? '#64748b'
              : '#d4af37',
          color: '#111827',
        }}
      >
        {status === 'loading'
          ? 'Hazırlanıyor...'
          : 'Bildirimleri Aç'}
      </button>
    </div>
  );
}

function detectPlatform() {
  const ua =
    navigator.userAgent;

  if (/iPhone/i.test(ua))
    return 'iPhone';

  if (/iPad/i.test(ua))
    return 'iPad';

  if (/Macintosh/i.test(ua))
    return 'Mac';

  if (/Android/i.test(ua))
    return 'Android';

  return 'Web';
}

async function createDeviceId(token) {
  const data =
    new TextEncoder().encode(token);

  const hash =
    await crypto.subtle.digest(
      'SHA-256',
      data
    );

  return Array.from(
    new Uint8Array(hash)
  )
    .map((byte) =>
      byte
        .toString(16)
        .padStart(2, '0')
    )
    .join('')
    .slice(0, 40);
}
