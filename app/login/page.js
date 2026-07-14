'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      if (!res.ok) {
        setError('Kullanıcı adı veya şifre hatalı.');
        return;
      }
      const params = new URLSearchParams(window.location.search);
      router.replace(params.get('next') || '/dashboard');
      router.refresh();
    } catch {
      setError('Bağlantı hatası oluştu. Tekrar deneyin.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={styles.main}>
      <form onSubmit={submit} style={styles.card}>
        <div style={styles.logo}>📈</div>
        <h1 style={styles.title}>Finans Paneli</h1>
        <p style={styles.sub}>Güvenli erişim</p>
        <label style={styles.label}>Kullanıcı adı</label>
        <input value={username} onChange={e => setUsername(e.target.value)} style={styles.input} autoComplete="username" required />
        <label style={styles.label}>Şifre</label>
        <input type="password" value={password} onChange={e => setPassword(e.target.value)} style={styles.input} autoComplete="current-password" required />
        {error && <div style={styles.error}>{error}</div>}
        <button disabled={loading} style={styles.button}>{loading ? 'Giriş yapılıyor…' : 'Giriş Yap'}</button>
      </form>
    </main>
  );
}

const styles = {
  main: { minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 20, background: 'radial-gradient(circle at top, #14213c, #080d18 55%)', color: '#e6edf7' },
  card: { width: '100%', maxWidth: 390, padding: 30, borderRadius: 20, background: 'linear-gradient(180deg,#121b30,#0d1424)', border: '1px solid #26365a', boxShadow: '0 20px 60px rgba(0,0,0,.45)' },
  logo: { fontSize: 42, textAlign: 'center' },
  title: { margin: '10px 0 4px', textAlign: 'center', fontSize: 28 },
  sub: { margin: '0 0 24px', textAlign: 'center', color: '#8ba0c0' },
  label: { display: 'block', margin: '14px 0 6px', fontSize: 12, color: '#8ba0c0', textTransform: 'uppercase', letterSpacing: '.5px' },
  input: { width: '100%', boxSizing: 'border-box', padding: '13px 14px', borderRadius: 10, border: '1px solid #26365a', background: '#080d18', color: '#fff', fontSize: 16, outline: 'none' },
  button: { width: '100%', marginTop: 22, padding: 13, borderRadius: 10, border: 0, background: '#2563eb', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer' },
  error: { marginTop: 14, color: '#fb7185', fontSize: 13 }
};
