'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { firebaseAuth } from '../../lib-firebase';

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const credential = await signInWithEmailAndPassword(
        firebaseAuth,
        email.trim(),
        password
      );

      const idToken = await credential.user.getIdToken();

      const response = await fetch('/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ idToken }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || 'Güvenli oturum oluşturulamadı.');
      }

      const params = new URLSearchParams(window.location.search);
const next = params.get('next') || '/senkron-panel';

      router.replace(next);
      router.refresh();
    } catch (err) {
      console.error('Giriş hatası:', err);

      if (
        err?.code === 'auth/invalid-credential' ||
        err?.code === 'auth/wrong-password' ||
        err?.code === 'auth/user-not-found'
      ) {
        setError('E-posta adresi veya şifre hatalı.');
      } else if (err?.code === 'auth/too-many-requests') {
        setError('Çok fazla giriş denemesi yapıldı. Bir süre sonra tekrar deneyin.');
      } else if (err?.code === 'auth/network-request-failed') {
        setError('İnternet bağlantısı kurulamadı.');
      } else {
        setError(err?.message || 'Giriş yapılamadı. Tekrar deneyin.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={styles.main}>
      <form onSubmit={submit} style={styles.card}>
        <div style={styles.logo}>📈</div>

        <h1 style={styles.title}>Finans Paneli</h1>
        <p style={styles.sub}>Firebase ile güvenli erişim</p>

        <label style={styles.label}>E-posta adresi</label>
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          style={styles.input}
          autoComplete="email"
          placeholder="ornek@email.com"
          required
        />

        <label style={styles.label}>Şifre</label>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          style={styles.input}
          autoComplete="current-password"
          required
        />

        {error && <div style={styles.error}>{error}</div>}

        <button
          type="submit"
          disabled={loading}
          style={{
            ...styles.button,
            opacity: loading ? 0.65 : 1,
            cursor: loading ? 'wait' : 'pointer',
          }}
        >
          {loading ? 'Giriş yapılıyor…' : 'Giriş Yap'}
        </button>
      </form>
    </main>
  );
}

const styles = {
  main: {
    minHeight: '100vh',
    display: 'grid',
    placeItems: 'center',
    padding: 20,
    background: 'radial-gradient(circle at top, #14213c, #080d18 55%)',
    color: '#e6edf7',
  },

  card: {
    width: '100%',
    maxWidth: 390,
    padding: 30,
    borderRadius: 20,
    background: 'linear-gradient(180deg, #121b30, #0d1424)',
    border: '1px solid #26365a',
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.45)',
  },

  logo: {
    fontSize: 42,
    textAlign: 'center',
  },

  title: {
    margin: '10px 0 4px',
    textAlign: 'center',
    fontSize: 28,
  },

  sub: {
    margin: '0 0 24px',
    textAlign: 'center',
    color: '#8ba0c0',
  },

  label: {
    display: 'block',
    margin: '14px 0 6px',
    fontSize: 12,
    color: '#8ba0c0',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },

  input: {
    width: '100%',
    boxSizing: 'border-box',
    padding: '13px 14px',
    borderRadius: 10,
    border: '1px solid #26365a',
    background: '#080d18',
    color: '#ffffff',
    fontSize: 16,
    outline: 'none',
  },

  button: {
    width: '100%',
    marginTop: 22,
    padding: 13,
    borderRadius: 10,
    border: 0,
    background: '#2563eb',
    color: '#ffffff',
    fontWeight: 700,
    fontSize: 15,
  },

  error: {
    marginTop: 14,
    padding: 10,
    borderRadius: 8,
    background: 'rgba(251, 113, 133, 0.1)',
    color: '#fb7185',
    fontSize: 13,
  },
};