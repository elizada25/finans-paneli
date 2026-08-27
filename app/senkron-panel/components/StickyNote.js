'use client';

import {
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  doc,
  onSnapshot,
  setDoc,
} from 'firebase/firestore';
import { firestoreDb } from '../../../lib-firebase';

export default function StickyNote({
  userId,
}) {
  const [text, setText] = useState('');
  const [ready, setReady] =
    useState(false);
  const [status, setStatus] =
    useState('Not yükleniyor…');

  const noteRef = useMemo(() => {
    if (!userId) return null;

    return doc(
      firestoreDb,
      'users',
      userId,
      'notes',
      'dashboard-sticky-note'
    );
  }, [userId]);

  useEffect(() => {
    if (!noteRef) return undefined;

    return onSnapshot(
      noteRef,
      (snapshot) => {
        const savedText =
          snapshot.exists()
            ? String(
                snapshot.data()?.text || ''
              )
            : '';

        setText(savedText);
        setReady(true);
        setStatus('Firebase ile eşitlendi');
      },
      (error) => {
        console.error(
          'Yapışkan not okunamadı:',
          error
        );

        setReady(true);
        setStatus('Not yüklenemedi');
      }
    );
  }, [noteRef]);

  useEffect(() => {
    if (!ready || !noteRef) return;

    const timer = window.setTimeout(
      async () => {
        try {
          setStatus('Kaydediliyor…');

          await setDoc(
            noteRef,
            {
              text,
              updatedAt:
                new Date().toISOString(),
            },
            { merge: true }
          );

          setStatus('Otomatik kaydedildi');
        } catch (error) {
          console.error(
            'Yapışkan not kaydedilemedi:',
            error
          );

          setStatus('Kaydedilemedi');
        }
      },
      650
    );

    return () =>
      window.clearTimeout(timer);
  }, [text, ready, noteRef]);

  return (
    <article
      style={{
        width: '360px',
        maxWidth: '100%',
        aspectRatio: '1 / 1',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        padding: '20px',
        border:
          '1px solid rgba(52,211,153,0.55)',
        borderRadius: '18px',
        color: '#33270b',
        background:
          'linear-gradient(145deg, #f9df75, #e8be42)',
        boxShadow:
          '0 20px 45px rgba(0,0,0,0.28)',
        transform: 'rotate(-0.5deg)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '10px',
          marginBottom: '12px',
        }}
      >
        <strong
          style={{
            fontSize: '17px',
          }}
        >
          📌 Yapışkan Not
        </strong>

        <span
          style={{
            fontSize: '9px',
            color: 'rgba(51,39,11,0.65)',
          }}
        >
          {status}
        </span>
      </div>

      <textarea
        value={text}
        onChange={(event) =>
          setText(event.target.value)
        }
        maxLength={3000}
        placeholder={
          'Takip edeceğin hisseleri, önemli seviyeleri veya günlük notlarını buraya yaz…'
        }
        style={{
          width: '100%',
          flex: 1,
          resize: 'none',
          boxSizing: 'border-box',
          padding: '12px',
          border:
            '1px solid rgba(84,62,10,0.18)',
          borderRadius: '11px',
          outline: 'none',
          color: '#33270b',
          background:
            'rgba(255,255,255,0.22)',
          fontFamily: 'inherit',
          fontSize: '14px',
          fontWeight: 650,
          lineHeight: 1.65,
        }}
      />

      <span
        style={{
          marginTop: '9px',
          color: 'rgba(51,39,11,0.60)',
          fontSize: '9px',
          textAlign: 'right',
        }}
      >
        {text.length}/3000
      </span>
    </article>
  );
}
