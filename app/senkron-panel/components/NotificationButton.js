'use client';

import { useEffect, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { getMessaging, getToken, isSupported } from 'firebase/messaging';
import { firebaseApp, firestoreDb } from '../../../lib-firebase';

const STORAGE_KEY = 'sky-finans-bildirimler-acik-v4';

export default function NotificationButton({ user }) {
  const [status, setStatus] = useState('idle');

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const localActive =
      localStorage.getItem(STORAGE_KEY) === 'true';

    const permissionGranted =
      'Notification' in window &&
      Notification.permission === 'granted';

    if (localActive) {
      setStatus('hidden');
    } else {
      setStatus('idle');
    }
  }, []);

  async function activateNotifications() {
    try {
      setStatus('loading');

      if (!user?.uid) {
        throw new Error('Önce Sky Finans hesabına giriş yapmalısınız.');
      }

      if (!('Notification' in window)) {
        throw new Error('Bu tarayıcı bildirim desteği sunmuyor.');
      }

      if (!('serviceWorker' in navigator)) {
        throw new Error('Bu tarayıcı Service Worker desteği sunmuyor.');
      }

      const supported = await isSupported();

      if (!supported) {
        throw new Error('Firebase bildirim sistemi bu cihazda desteklenmiyor.');
      }

      let permission = Notification.permission;

      if (permission === 'default') {
        permission = await Notification.requestPermission();
      }

      if (permission !== 'granted') {
        alert(
          'Bildirim izni verilmedi. Safari ayarlarından bu site için bildirimlere izin vermeniz gerekiyor.'
        );
        setStatus('idle');
        return;
      }

      const vapidKey =
        process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;

      if (!vapidKey) {
        throw new Error('Firebase VAPID anahtarı bulunamadı.');
      }

      const registration =
        await navigator.serviceWorker.register(
          '/firebase-messaging-sw.js'
        );

      await navigator.serviceWorker.ready;

      const messaging =
        getMessaging(firebaseApp);

      const token =
        await getToken(messaging, {
          vapidKey,
          serviceWorkerRegistration: registration,
        });

      if (!token) {
        throw new Error('Bildirim anahtarı oluşturulamadı.');
      }

      const deviceId =
        await createDeviceId(token);

      const platform = detectPlatform();

      try {
        const devicesSnapshot = await getDocs(
          collection(
            firestoreDb,
            'users',
            user.uid,
            'notificationDevices'
          )
        );

        const oldDevices = devicesSnapshot.docs.filter(
          (device) => {
            const data = device.data();

            return (
              device.id !== deviceId &&
              data?.token !== token &&
              (data?.userAgent === navigator.userAgent ||
                data?.platform === platform)
            );
          }
        );

        await Promise.all(
          oldDevices.map((device) =>
            deleteDoc(device.ref)
          )
        );
      } catch (cleanupError) {
        console.warn(
          'Eski bildirim cihazları temizlenemedi:',
          cleanupError
        );
      }

      await setDoc(
        doc(firestoreDb, 'users', user.uid),
        { updatedAt: serverTimestamp() },
        { merge: true }
      );

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
          platform,
          userAgent: navigator.userAgent,
          updatedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
        },
        {
          merge: true,
        }
      );

      localStorage.setItem(
        STORAGE_KEY,
        'true'
      );

      setStatus('hidden');

      alert('✅ Sky Finans bildirimleri başarıyla aktif edildi.');

    } catch (error) {
      console.error(
        'Sky bildirim hatası:',
        error
      );

      alert(
        '❌ Bildirimler aktif edilemedi:\n\n' +
        (error?.message || 'Bilinmeyen hata')
      );

      setStatus('idle');
    }
  }

  if (status === 'hidden') {
    return null;
  }

  return (
    <div
      style={{
        padding: '14px',
        marginBottom: '16px',
        borderRadius: '14px',
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(52,211,153,0.32)',
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
        Fiyat alarmı ve önemli gelişmeleri iPhone&apos;undan takip et.
      </div>

      <button
        type="button"
        onClick={activateNotifications}
        disabled={status === 'loading'}
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
              : '#34d399',
          color: '#111827',
        }}
      >
        {status === 'loading'
          ? 'Bildirimler hazırlanıyor...'
          : '🔔 Bildirimleri Aç'}
      </button>
    </div>
  );
}

function detectPlatform() {
  const ua = navigator.userAgent;

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
