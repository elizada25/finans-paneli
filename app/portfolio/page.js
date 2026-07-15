'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { firebaseAuth, firestoreDb } from '../../lib-firebase';

export default function PortfolioPage() {
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [stocks, setStocks] = useState([]);

  const [code, setCode] = useState('');
  const [market, setMarket] = useState('bist');
  const [lot, setLot] = useState('');
  const [cost, setCost] = useState('');

  const [status, setStatus] = useState('Kullanıcı kontrol ediliyor…');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let unsubscribePortfolio = null;

    const unsubscribeAuth = onAuthStateChanged(
      firebaseAuth,
      (currentUser) => {
        if (unsubscribePortfolio) {
          unsubscribePortfolio();
          unsubscribePortfolio = null;
        }

        if (!currentUser) {
          setUser(null);
          setStocks([]);
          setStatus('Giriş ekranına yönlendiriliyor…');

          router.replace('/login?next=/portfolio');
          return;
        }

        setUser(currentUser);
        setStatus('Portföy yükleniyor…');

        const portfolioRef = collection(
          firestoreDb,
          'users',
          currentUser.uid,
          'portfolio'
        );

        unsubscribePortfolio = onSnapshot(
          portfolioRef,
          (snapshot) => {
            const items = snapshot.docs.map((stockDocument) => ({
              id: stockDocument.id,
              ...stockDocument.data(),
            }));

            items.sort((a, b) =>
              String(a.code || '').localeCompare(String(b.code || ''))
            );

            setStocks(items);
            setStatus('');
          },
          (error) => {
            console.error('Portföy okuma hatası:', error);
            setStatus(`Portföy yüklenemedi: ${error.message}`);
          }
        );
      }
    );

    return () => {
      unsubscribeAuth();

      if (unsubscribePortfolio) {
        unsubscribePortfolio();
      }
    };
  }, [router]);

  async function addStock(event) {
    event.preventDefault();

    if (!user) {
      router.replace('/login?next=/portfolio');
      return;
    }

    const normalizedCode = code.trim().toUpperCase();
    const numericLot = Number(lot);
    const numericCost = Number(cost);

    if (
      !normalizedCode ||
      !Number.isFinite(numericLot) ||
      numericLot <= 0 ||
      !Number.isFinite(numericCost) ||
      numericCost <= 0
    ) {
      setStatus('Hisse kodu, lot ve maliyet bilgilerini kontrol et.');
      return;
    }

    setSaving(true);
    setStatus('Kaydediliyor…');

    try {
      await addDoc(
        collection(
          firestoreDb,
          'users',
          user.uid,
          'portfolio'
        ),
        {
          code: normalizedCode,
          market,
          lot: numericLot,
          cost: numericCost,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }
      );

      setCode('');
      setLot('');
      setCost('');

      setStatus('✅ Hisse Firestore’a kaydedildi.');
    } catch (error) {
      console.error('Hisse kaydetme hatası:', error);
      setStatus(`❌ Kayıt hatası: ${error.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function removeStock(stockId, stockCode) {
    if (!user) return;

    const confirmed = window.confirm(
      `${stockCode} hissesini portföyden silmek istiyor musun?`
    );

    if (!confirmed) return;

    try {
      await deleteDoc(
        doc(
          firestoreDb,
          'users',
          user.uid,
          'portfolio',
          stockId
        )
      );

      setStatus('✅ Hisse silindi.');
    } catch (error) {
      console.error('Silme hatası:', error);
      setStatus(`❌ Silme hatası: ${error.message}`);
    }
  }

  return (
    <main style={styles.main}>
      <section style={styles.container}>
        <div style={styles.heading}>
          <div>
            <h1 style={styles.title}>Yeni Portföy</h1>

            <p style={styles.subtitle}>
              Veriler Firebase Firestore’da saklanır.
            </p>
          </div>

          <a href="/dashboard" style={styles.backLink}>
            Eski panele dön
          </a>
        </div>

        <form onSubmit={addStock} style={styles.form}>
          <div style={styles.field}>
            <label style={styles.label}>Hisse kodu</label>

            <input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="THYAO"
              style={styles.input}
              required
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Piyasa</label>

            <select
              value={market}
              onChange={(event) => setMarket(event.target.value)}
              style={styles.input}
            >
              <option value="bist">BIST</option>
              <option value="us">NASDAQ / ABD</option>
            </select>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Lot</label>

            <input
              type="number"
              min="0"
              step="any"
              value={lot}
              onChange={(event) => setLot(event.target.value)}
              placeholder="1"
              style={styles.input}
              required
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Maliyet</label>

            <input
              type="number"
              min="0"
              step="any"
              value={cost}
              onChange={(event) => setCost(event.target.value)}
              placeholder="300"
              style={styles.input}
              required
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            style={{
              ...styles.addButton,
              opacity: saving ? 0.65 : 1,
              cursor: saving ? 'wait' : 'pointer',
            }}
          >
            {saving ? 'Kaydediliyor…' : 'Hisse Ekle'}
          </button>
        </form>

        {status && (
          <div style={styles.status}>
            {status}
          </div>
        )}

        <div style={styles.tableWrapper}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Hisse</th>
                <th style={styles.th}>Piyasa</th>
                <th style={styles.th}>Lot</th>
                <th style={styles.th}>Maliyet</th>
                <th style={styles.th}>Toplam Maliyet</th>
                <th style={styles.th}>İşlem</th>
              </tr>
            </thead>

            <tbody>
              {stocks.length === 0 ? (
                <tr>
                  <td colSpan="6" style={styles.empty}>
                    Henüz portföye hisse eklenmedi.
                  </td>
                </tr>
              ) : (
                stocks.map((stock) => {
                  const totalCost =
                    Number(stock.lot) * Number(stock.cost);

                  return (
                    <tr key={stock.id}>
                      <td style={styles.td}>
                        <strong>{stock.code}</strong>
                      </td>

                      <td style={styles.td}>
                        {stock.market === 'bist'
                          ? 'BIST'
                          : 'ABD'}
                      </td>

                      <td style={styles.td}>
                        {stock.lot}
                      </td>

                      <td style={styles.td}>
                        {Number(stock.cost).toLocaleString(
                          'tr-TR',
                          {
                            maximumFractionDigits: 2,
                          }
                        )}
                      </td>

                      <td style={styles.td}>
                        {totalCost.toLocaleString('tr-TR', {
                          maximumFractionDigits: 2,
                        })}
                      </td>

                      <td style={styles.td}>
                        <button
                          type="button"
                          onClick={() =>
                            removeStock(stock.id, stock.code)
                          }
                          style={styles.deleteButton}
                        >
                          Sil
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

const styles = {
  main: {
    minHeight: '100vh',
    padding: 24,
    background: '#080d18',
    color: '#e6edf7',
    boxSizing: 'border-box',
  },

  container: {
    width: '100%',
    maxWidth: 1200,
    margin: '0 auto',
  },

  heading: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 16,
    marginBottom: 24,
  },

  title: {
    margin: 0,
    fontSize: 30,
  },

  subtitle: {
    margin: '6px 0 0',
    color: '#8ba0c0',
  },

  backLink: {
    padding: '10px 14px',
    border: '1px solid #33466f',
    borderRadius: 10,
    color: '#ffffff',
    textDecoration: 'none',
  },

  form: {
    display: 'grid',
    gridTemplateColumns:
      'minmax(150px, 2fr) minmax(130px, 1.4fr) minmax(90px, 1fr) minmax(100px, 1fr) auto',
    gap: 12,
    alignItems: 'end',
    padding: 18,
    border: '1px solid #26365a',
    borderRadius: 16,
    background: '#10192c',
  },

  field: {
    minWidth: 0,
  },

  label: {
    display: 'block',
    marginBottom: 6,
    color: '#8ba0c0',
    fontSize: 12,
    textTransform: 'uppercase',
  },

  input: {
    width: '100%',
    boxSizing: 'border-box',
    padding: '12px',
    border: '1px solid #33466f',
    borderRadius: 9,
    background: '#080d18',
    color: '#ffffff',
    fontSize: 15,
  },

  addButton: {
    padding: '12px 18px',
    border: 0,
    borderRadius: 9,
    background: '#2563eb',
    color: '#ffffff',
    fontWeight: 700,
  },

  status: {
    marginTop: 14,
    padding: 12,
    border: '1px solid #26365a',
    borderRadius: 10,
    background: '#10192c',
  },

  tableWrapper: {
    marginTop: 20,
    overflowX: 'auto',
    border: '1px solid #26365a',
    borderRadius: 16,
  },

  table: {
    width: '100%',
    minWidth: 720,
    borderCollapse: 'collapse',
    background: '#10192c',
  },

  th: {
    padding: 14,
    borderBottom: '1px solid #26365a',
    color: '#8ba0c0',
    textAlign: 'left',
    fontSize: 12,
    textTransform: 'uppercase',
  },

  td: {
    padding: 14,
    borderBottom: '1px solid #1d2944',
  },

  empty: {
    padding: 30,
    textAlign: 'center',
    color: '#8ba0c0',
  },

  deleteButton: {
    padding: '7px 11px',
    border: '1px solid #7f1d1d',
    borderRadius: 8,
    background: '#3f1219',
    color: '#fecaca',
    cursor: 'pointer',
  },
};