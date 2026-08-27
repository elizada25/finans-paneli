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
import {
  deleteToken,
  getMessaging,
  getToken,
  isSupported,
  onMessage,
} from 'firebase/messaging';
import { firebaseApp, firestoreDb } from '../../../lib-firebase';

const STORAGE_KEY = 'sky-finans-bildirimler-acik-v5';

export default function NotificationButton({ user }) {
  const [status, setStatus] = useState('checking');
  const [message, setMessage] = useState('Bildirim durumu kontrol ediliyor…');

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const permission =
      'Notification' in window ? Notification.permission : 'unsupported';
    const previouslyActive = localStorage.getItem(STORAGE_KEY) === 'true';

    if (permission === 'granted' && previouslyActive) {
      setStatus('hidden');
    } else if (permission === 'denied') {
      setStatus('blocked');
      setMessage('iPhone ayarlarında SKY FİNANS bildirim izni kapalı.');
    } else {
      setStatus('idle');
      setMessage('Mobil bildirimleri bu cihaz için etkinleştirin.');
    }
  }, []);

  async function refreshAndTest() {
    try {
      setStatus('loading');
      setMessage('Cihaz kaydı yenileniyor…');

      if (!user?.uid || typeof user.getIdToken !== 'function') {
        throw new Error('Önce Sky Finans hesabına giriş yapmalısınız.');
      }

      if (!('Notification' in window) || !('serviceWorker' in navigator)) {
        throw new Error('Bu tarayıcı web bildirimlerini desteklemiyor.');
      }

      if (isAppleMobile() && !isStandaloneApp()) {
        throw new Error(
          'iPhone bildirimleri için siteyi Safari paylaş menüsünden Ana Ekrana Eklemeniz ve SKY FİNANS simgesinden açmanız gerekir.'
        );
      }

      if (!(await isSupported())) {
        throw new Error('Firebase bildirim sistemi bu cihazda desteklenmiyor.');
      }

      let permission = Notification.permission;
      if (permission !== 'granted') {
        permission = await Notification.requestPermission();
      }

      if (permission !== 'granted') {
        throw new Error(
          'Bildirim izni verilmedi. iPhone Ayarlar > Uygulamalar > SKY FİNANS > Bildirimler bölümünden izin verin.'
        );
      }

      const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
      if (!vapidKey || vapidKey === '[SENSITIVE]') {
        throw new Error('Firebase VAPID anahtarı bulunamadı.');
      }

      const registration = await navigator.serviceWorker.register(
        '/firebase-messaging-sw.js',
        { updateViaCache: 'none' }
      );
      await registration.update().catch(() => null);
      await navigator.serviceWorker.ready;

      const messaging = getMessaging(firebaseApp);
      await deleteToken(messaging).catch(() => false);

      const token = await getToken(messaging, {
        vapidKey,
        serviceWorkerRegistration: registration,
      });
      if (!token) throw new Error('Yeni bildirim anahtarı oluşturulamadı.');

      const deviceId = await createDeviceId(token);
      const platform = detectPlatform();
      const devicesRef = collection(
        firestoreDb,
        'users',
        user.uid,
        'notificationDevices'
      );
      const devicesSnapshot = await getDocs(devicesRef);
      const oldSamePlatformDevices = devicesSnapshot.docs.filter((device) => {
        const data = device.data();
        return (
          device.id !== deviceId &&
          (data?.platform === platform || data?.userAgent === navigator.userAgent)
        );
      });

      await Promise.all(
        oldSamePlatformDevices.map((device) => deleteDoc(device.ref))
      );

      await setDoc(
        doc(firestoreDb, 'users', user.uid),
        { updatedAt: serverTimestamp() },
        { merge: true }
      );
      await setDoc(
        doc(firestoreDb, 'users', user.uid, 'notificationDevices', deviceId),
        {
          token,
          enabled: true,
          platform,
          userAgent: navigator.userAgent,
          standalone: isStandaloneApp(),
          updatedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );

      const unsubscribe = onMessage(messaging, async (payload) => {
        await registration.showNotification(
          payload?.data?.title || '✅ SKY FİNANS',
          {
            body: payload?.data?.body || 'Mobil bildirim bağlantısı çalışıyor.',
            icon: '/icon-192.png',
            badge: '/icon-192.png',
            data: { url: payload?.data?.url || '/senkron-panel' },
            tag: `sky-mobile-test-${Date.now()}`,
          }
        );
      });
      window.setTimeout(unsubscribe, 20000);

      const idToken = await user.getIdToken(true);
      const response = await fetch('/api/notifications/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ deviceId, token }),
      });
      const result = await response.json();

      if (!response.ok || !result?.ok || result?.sent !== 1) {
        throw new Error(result?.error || 'Test bildirimi gönderilemedi.');
      }

      localStorage.setItem(STORAGE_KEY, 'true');
      setStatus('success');
      setMessage('Test gönderildi. Bildirim birkaç saniye içinde görünmelidir.');
      window.setTimeout(() => setStatus('hidden'), 2500);
    } catch (error) {
      console.error('Sky bildirim yenileme hatası:', error);
      setStatus('error');
      setMessage(error?.message || 'Bildirim kaydı yenilenemedi.');
    }
  }

  const buttonLabel =
    status === 'loading'
      ? 'Bildirim hazırlanıyor…'
      : status === 'ready' || status === 'success'
        ? '🔄 Bildirimi Yenile ve Test Et'
        : '🔔 Bildirimleri Aç ve Test Et';

  if (status === 'checking' || status === 'hidden') {
    return null;
  }

  return (
    <div className={`notificationPanel ${status}`}>
      <div className="notificationText">
        <strong>🔔 Mobil Bildirimler</strong>
        <span>{message}</span>
      </div>
      <button
        type="button"
        onClick={refreshAndTest}
        disabled={status === 'loading'}
      >
        {buttonLabel}
      </button>

      <style jsx>{`
        .notificationPanel {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          margin-bottom: 16px;
          padding: 13px 14px;
          border: 1px solid rgba(52, 211, 153, 0.28);
          border-radius: 14px;
          background: rgba(14, 24, 37, 0.92);
        }
        .notificationPanel.error,
        .notificationPanel.blocked { border-color: rgba(248, 113, 113, 0.42); }
        .notificationPanel.success {
          border-color: rgba(74, 222, 128, 0.58);
          background: rgba(20, 65, 52, 0.3);
        }
        .notificationText { display: grid; gap: 4px; min-width: 0; }
        .notificationText strong { color: #e5edf7; font-size: 13px; }
        .notificationText span { color: #94a3b8; font-size: 11px; line-height: 1.45; }
        .error .notificationText span,
        .blocked .notificationText span { color: #fca5a5; }
        button {
          flex: 0 0 auto;
          min-height: 40px;
          padding: 0 14px;
          border: 1px solid rgba(52, 211, 153, 0.45);
          border-radius: 10px;
          color: #07120f;
          background: #34d399;
          font: inherit;
          font-size: 11px;
          font-weight: 900;
          cursor: pointer;
        }
        button:disabled { cursor: wait; opacity: 0.62; }
        @media (max-width: 700px) {
          .notificationPanel { align-items: stretch; flex-direction: column; }
          button { width: 100%; }
        }
      `}</style>
    </div>
  );
}

function isAppleMobile() {
  return (
    /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

function isStandaloneApp() {
  return Boolean(
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
}

function detectPlatform() {
  if (/iPhone/i.test(navigator.userAgent)) return 'iPhone';
  if (/iPad/i.test(navigator.userAgent)) return 'iPad';
  if (/Android/i.test(navigator.userAgent)) return 'Android';
  if (/Macintosh/i.test(navigator.userAgent)) return 'Mac';
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
