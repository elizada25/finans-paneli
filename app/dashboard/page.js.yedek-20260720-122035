'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { firebaseAuth, firestoreDb } from '../../lib-firebase';

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [testStatus, setTestStatus] = useState('');
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      firebaseAuth,
      (currentUser) => {
        setUser(currentUser);
      }
    );

    return unsubscribe;
  }, []);

  async function testFirestore() {
    if (!user) {
      setTestStatus('Firebase kullanıcısı henüz hazır değil.');
      return;
    }

    setTestStatus('Test kaydı yazılıyor…');

    try {
      await setDoc(
        doc(
          firestoreDb,
          'users',
          user.uid,
          'tests',
          'connection'
        ),
        {
          message: 'Firestore bağlantısı başarılı',
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setTestStatus('✅ Firestore bağlantısı başarılı.');
    } catch (error) {
      console.error(error);
      setTestStatus(`❌ Firestore hatası: ${error.message}`);
    }
  }

  async function logout() {
    setLoggingOut(true);

    try {
      await fetch('/api/logout', {
        method: 'POST',
      });
    } finally {
      router.replace('/login');
      router.refresh();
    }
  }

  return (
    <main style={styles.main}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>Finans Paneli</h1>
          <p style={styles.subtitle}>Portföy takip ekranı</p>
        </div>

        <button
          type="button"
          onClick={logout}
          disabled={loggingOut}
          style={styles.logoutButton}
        >
          {loggingOut ? 'Çıkış yapılıyor…' : 'Çıkış Yap'}
        </button>
      </header>

      <section style={styles.testBox}>
        <button
          type="button"
          onClick={testFirestore}
          style={styles.testButton}
        >
          Firestore Bağlantısını Test Et
        </button>

        {testStatus && <span>{testStatus}</span>}
      </section>

      <section style={styles.panelContainer}>
        <iframe
          src="/panel.html"
          title="Finans Paneli"
          style={styles.iframe}
        />
      </section>
    </main>
  );
}

const styles = {
  main: {
    minHeight: '100vh',
    padding: 18,
    background: '#080d18',
    color: '#e6edf7',
    boxSizing: 'border-box',
  },

  header: {
    maxWidth: 1500,
    margin: '0 auto 14px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 16,
  },

  title: {
    margin: 0,
    fontSize: 24,
  },

  subtitle: {
    margin: '4px 0 0',
    color: '#8ba0c0',
    fontSize: 14,
  },

  logoutButton: {
    padding: '10px 16px',
    border: '1px solid #33466f',
    borderRadius: 10,
    background: '#121b30',
    color: '#ffffff',
    fontWeight: 700,
    cursor: 'pointer',
  },

  testBox: {
    maxWidth: 1500,
    margin: '0 auto 14px',
    display: 'flex',
    alignItems: 'center',
    gap: 14,
  },

  testButton: {
    padding: '10px 16px',
    border: 0,
    borderRadius: 10,
    background: '#2563eb',
    color: '#ffffff',
    fontWeight: 700,
    cursor: 'pointer',
  },

  panelContainer: {
    width: '100%',
    maxWidth: 1500,
    height: 'calc(100vh - 150px)',
    margin: '0 auto',
    overflow: 'hidden',
    border: '1px solid #26365a',
    borderRadius: 16,
    background: '#0d1424',
  },

  iframe: {
    width: '100%',
    height: '100%',
    border: 0,
    display: 'block',
  },
};