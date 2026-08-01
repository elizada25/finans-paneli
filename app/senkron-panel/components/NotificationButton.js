'use client';

import { useEffect, useState } from 'react';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { getMessaging, getToken, isSupported } from 'firebase/messaging';
import { firebaseApp, firestoreDb } from '../../../lib-firebase';

export default function NotificationButton({ user }) {
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (
      typeof window !== 'undefined' &&
      'Notification' in window &&
      Notification.permission === 'granted'
    ) {
      setStatus('idle');
      setMessage(
        'Bildirim izni açık. Bu iPhone’u Firebase’e kaydetmek için butona dokun.'
      );
    }
  }, []);

  async function activateNotifications() {
    try {
      setStatus('loading');
      setMessage('Bildirim sistemi hazırlanıyor...');

      if (!user?.uid) {
        throw new Error('Önce Sky Finans hesabına giriş yapmalısınız.');
      }

      const supported = await isSupported();

      if (!supported) {
        throw new Error(
          "Bu cihaz bildirim sistemini desteklemiyor. iPhone'da uygulamayı ana ekrandaki Sky Finans simgesinden açın."
        );
      }

      if (!('serviceWorker' in navigator)) {
        throw new Error('Bu cihaz Service Worker desteği sunmuyor.');
      }

      if (!('Notification' in window)) {
        throw new Error(
          "iPhone'da Safari yerine ana ekrandaki Sky Finans simgesinden açın."
        );
      }

      const permission = await Notification.requestPermission();

      if (permission !== 'granted') {
        throw new Error('Bildirim izni verilmedi.');
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

      const messaging = getMessaging(firebaseApp);

      const token = await getToken(messaging, {
        vapidKey,
        serviceWorkerRegistration: registration,
      });

      if (!token) {
        throw new Error(
          'iPhone bildirim anahtarı oluşturulamadı.'
        );
      }

      const deviceId = await createDeviceId(token);

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
        { merge: true }
      );

      setStatus('active');
      setMessage(
        'Bildirimler başarıyla açıldı. Test bildirimi göndermeye hazır.'
      );
    } catch (error) {
      console.error('Sky bildirim hatası:', error);

      setStatus('error');
      setMessage(
        error?.message ||
          'Bildirimler açılırken bilinmeyen bir hata oluştu.'
      );
    }
  }

  return (
    <div
      style={{
        padding: '14px',
        marginBottom: '16px',
        borderRadius: '14px',
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(212,175,55,0.32)',
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
        disabled={
          status === 'loading' || status === 'active'
        }
        style={{
          width: '100%',
          minHeight: '44px',
          border: 0,
          borderRadius: '10px',
          fontWeight: 800,
          fontSize: '14px',
          cursor:
            status === 'loading' || status === 'active'
              ? 'default'
              : 'pointer',
          background:
            status === 'active'
              ? '#1f9d55'
              : status === 'loading'
                ? '#64748b'
                : '#d4af37',
          color:
            status === 'active' ? '#ffffff' : '#111827',
        }}
      >
        {status === 'loading'
          ? 'Hazırlanıyor...'
          : status === 'active'
            ? '✓ Bildirimler Açık'
            : 'Bildirimleri Aç'}
      </button>

      {message && (
        <div
          style={{
            marginTop: '9px',
            fontSize: '12px',
            color:
              status === 'error'
                ? '#ff7b7b'
                : '#cbd5e1',
          }}
        >
          {message}
        </div>
      )}
    </div>
  );
}

function detectPlatform() {
  const ua = navigator.userAgent;

  if (/iPhone/i.test(ua)) return 'iPhone';
  if (/iPad/i.test(ua)) return 'iPad';
  if (/Macintosh/i.test(ua)) return 'Mac';
  if (/Android/i.test(ua)) return 'Android';

  return 'Web';
}

async function createDeviceId(token) {
  const data = new TextEncoder().encode(token);
  const hash = await crypto.subtle.digest('SHA-256', data);

  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 40);
}
