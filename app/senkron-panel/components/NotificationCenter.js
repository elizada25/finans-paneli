'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { firestoreDb } from '../../../lib-firebase';

export default function NotificationCenter({ user }) {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const panelRef = useRef(null);

  useEffect(() => {
    if (!user?.uid) return undefined;

    const notificationsQuery = query(
      collection(firestoreDb, 'users', user.uid, 'notifications'),
      orderBy('createdAt', 'desc'),
      limit(40)
    );

    return onSnapshot(
      notificationsQuery,
      (snapshot) => {
        setItems(
          snapshot.docs.map((notification) => ({
            id: notification.id,
            ...notification.data(),
          }))
        );
        setLoading(false);
        setError('');

        if (snapshot.empty) {
          setDoc(
            doc(
              firestoreDb,
              'users',
              user.uid,
              'notifications',
              'system_notification_center_v1'
            ),
            {
              title: '✅ Bildirim merkezi hazır',
              body:
                'Fiyat hareketleri, önemli haberler ve kapanış özetleri artık burada da saklanacak.',
              type: 'system',
              url: '/senkron-panel',
              read: false,
              createdAt: serverTimestamp(),
            },
            { merge: false }
          ).catch((writeError) =>
            console.warn('İlk bildirim kaydı oluşturulamadı:', writeError)
          );
        }
      },
      (snapshotError) => {
        console.error('Bildirim merkezi okunamadı:', snapshotError);
        setLoading(false);
        setError('Bildirimler yüklenemedi.');
      }
    );
  }, [user?.uid]);

  useEffect(() => {
    function handleOutside(event) {
      if (panelRef.current && !panelRef.current.contains(event.target)) {
        setOpen(false);
      }
    }

    document.addEventListener('pointerdown', handleOutside);
    return () => document.removeEventListener('pointerdown', handleOutside);
  }, []);

  const unreadCount = useMemo(
    () => items.filter((item) => item.read !== true).length,
    [items]
  );

  async function markAllRead() {
    if (!user?.uid || unreadCount === 0) return;

    const batch = writeBatch(firestoreDb);
    for (const item of items.filter((entry) => entry.read !== true)) {
      batch.update(
        doc(firestoreDb, 'users', user.uid, 'notifications', item.id),
        { read: true, readAt: new Date().toISOString() }
      );
    }
    await batch.commit();
  }

  async function openNotification(item) {
    if (item.read !== true) {
      await updateDoc(
        doc(firestoreDb, 'users', user.uid, 'notifications', item.id),
        { read: true, readAt: new Date().toISOString() }
      ).catch(() => null);
    }

    const target = String(item.url || '/senkron-panel');
    if (/^https?:\/\//i.test(target)) {
      window.open(target, '_blank', 'noopener,noreferrer');
    } else if (target !== '/senkron-panel') {
      window.location.href = target;
    }
    setOpen(false);
  }

  return (
    <div className="notificationCenter" ref={panelRef}>
      <button
        type="button"
        className={open ? 'bellButton active' : 'bellButton'}
        onClick={() => setOpen((current) => !current)}
        aria-label={`Bildirimler${unreadCount ? `, ${unreadCount} okunmamış` : ''}`}
        aria-expanded={open}
      >
        <span className="bell">🔔</span>
        <span className="bellText">Bildirimler</span>
        {unreadCount ? (
          <span className="count">{unreadCount > 99 ? '99+' : unreadCount}</span>
        ) : null}
      </button>

      {open ? (
        <div className="notificationDropdown">
          <div className="dropdownHeader">
            <div>
              <small>SKY FİNANS</small>
              <strong>Bildirim Merkezi</strong>
            </div>
            {unreadCount ? (
              <button type="button" onClick={markAllRead}>Tümünü okundu yap</button>
            ) : null}
          </div>

          <div className="pushState">
            <span className={pushAllowed() ? 'stateDot active' : 'stateDot'} />
            {pushAllowed()
              ? 'iPhone push bildirimi açık'
              : 'Bu cihazda push izni kapalı'}
          </div>

          <div className="notificationList">
            {loading ? <div className="empty">Bildirimler yükleniyor…</div> : null}
            {error ? <div className="empty error">{error}</div> : null}
            {!loading && !error && !items.length ? (
              <div className="empty">
                <span>🔕</span>
                <strong>Henüz tetiklenen bildirim yok</strong>
                <small>
                  Fiyat hareketi, önemli haber ve kapanış özetleri burada saklanacak.
                </small>
              </div>
            ) : null}

            {items.map((item) => (
              <button
                type="button"
                key={item.id}
                className={item.read === true ? 'notificationItem' : 'notificationItem unread'}
                onClick={() => openNotification(item)}
              >
                <span className="itemIcon">{iconFor(item.type)}</span>
                <span className="itemContent">
                  <strong>{item.title || 'SKY Finans bildirimi'}</strong>
                  <span>{item.body || 'Yeni bir gelişme var.'}</span>
                  <small>{formatTime(item.createdAt)}</small>
                </span>
                {item.read !== true ? <span className="unreadDot" /> : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <style jsx>{`
        .notificationCenter { position: relative; flex: 0 0 auto; }
        .bellButton {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          min-height: 42px;
          padding: 0 13px;
          border: 1px solid rgba(245, 220, 125, 0.36);
          border-radius: 11px;
          color: #f5dc7d;
          background: rgba(245, 220, 125, 0.08);
          font: inherit;
          font-size: 11px;
          font-weight: 900;
          cursor: pointer;
        }
        .bellButton.active { background: rgba(245, 220, 125, 0.16); }
        .bell { font-size: 16px; }
        .count {
          display: grid;
          place-items: center;
          min-width: 20px;
          height: 20px;
          padding: 0 5px;
          border-radius: 999px;
          color: #fff;
          background: #ef4444;
          font-size: 9px;
          box-shadow: 0 0 0 2px #111821;
        }
        .notificationDropdown {
          position: absolute;
          z-index: 10000;
          top: calc(100% + 9px);
          right: 0;
          width: min(410px, calc(100vw - 24px));
          overflow: hidden;
          border: 1px solid rgba(52, 211, 153, 0.3);
          border-radius: 16px;
          color: #e5edf7;
          background: #0c141f;
          box-shadow: 0 25px 70px rgba(0, 0, 0, 0.55);
        }
        .dropdownHeader {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 15px 16px 12px;
          border-bottom: 1px solid rgba(148, 163, 184, 0.12);
        }
        .dropdownHeader > div { display: grid; gap: 3px; }
        .dropdownHeader small { color: #34d399; font-size: 8px; font-weight: 950; letter-spacing: 1px; }
        .dropdownHeader strong { font-size: 15px; }
        .dropdownHeader button {
          border: 0;
          color: #7dd3fc;
          background: transparent;
          font: inherit;
          font-size: 9px;
          font-weight: 850;
          cursor: pointer;
        }
        .pushState {
          display: flex;
          align-items: center;
          gap: 7px;
          padding: 9px 16px;
          color: #94a3b8;
          background: rgba(2, 6, 12, 0.36);
          font-size: 9px;
        }
        .stateDot { width: 7px; height: 7px; border-radius: 50%; background: #64748b; }
        .stateDot.active { background: #4ade80; box-shadow: 0 0 9px rgba(74, 222, 128, 0.75); }
        .notificationList { max-height: min(520px, 66vh); overflow-y: auto; }
        .notificationItem {
          display: grid;
          grid-template-columns: 34px minmax(0, 1fr) 8px;
          align-items: start;
          gap: 9px;
          width: 100%;
          padding: 13px 14px;
          border: 0;
          border-bottom: 1px solid rgba(148, 163, 184, 0.09);
          color: inherit;
          background: transparent;
          text-align: left;
          cursor: pointer;
        }
        .notificationItem.unread { background: rgba(52, 211, 153, 0.065); }
        .notificationItem:hover { background: rgba(255, 255, 255, 0.04); }
        .itemIcon {
          display: grid;
          place-items: center;
          width: 34px;
          height: 34px;
          border-radius: 10px;
          background: rgba(148, 163, 184, 0.1);
          font-size: 16px;
        }
        .itemContent { display: grid; gap: 4px; min-width: 0; }
        .itemContent strong { color: #e5edf7; font-size: 11px; line-height: 1.35; }
        .itemContent > span { color: #94a3b8; font-size: 10px; line-height: 1.45; }
        .itemContent small { color: #536174; font-size: 8px; }
        .unreadDot { width: 7px; height: 7px; margin-top: 4px; border-radius: 50%; background: #34d399; }
        .empty {
          display: grid;
          justify-items: center;
          gap: 6px;
          padding: 35px 20px;
          color: #718096;
          text-align: center;
          font-size: 11px;
        }
        .empty > span { font-size: 25px; }
        .empty strong { color: #cbd5e1; }
        .empty small { max-width: 290px; line-height: 1.5; }
        .empty.error { color: #fca5a5; }
        @media (max-width: 700px) {
          .bellText { display: none; }
          .bellButton { width: 44px; padding: 0; }
          .count {
            position: absolute;
            top: -6px;
            right: -6px;
            min-width: 18px;
            height: 18px;
          }
          .notificationDropdown {
            position: fixed;
            top: 72px;
            right: 12px;
            left: 12px;
            width: auto;
            max-height: calc(100vh - 100px);
          }
        }
      `}</style>
    </div>
  );
}

function pushAllowed() {
  return typeof window !== 'undefined' &&
    'Notification' in window &&
    Notification.permission === 'granted';
}

function iconFor(type) {
  const value = String(type || '');
  if (value.includes('news')) return '📰';
  if (value.includes('close')) return '📊';
  if (value.includes('volume')) return '🚨';
  if (value.includes('up') || value.includes('above')) return '📈';
  if (value.includes('down') || value.includes('below')) return '📉';
  return '🔔';
}

function formatTime(value) {
  const raw = value?.toDate ? value.toDate() : new Date(value || 0);
  if (!(raw instanceof Date) || Number.isNaN(raw.getTime())) return 'Şimdi';
  return raw.toLocaleString('tr-TR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
