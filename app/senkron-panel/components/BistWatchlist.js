'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
} from 'firebase/firestore';
import { firestoreDb } from '../../../lib-firebase';

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function money(value) {
  const number = numberValue(value);

  if (number === null) return '—';

  return `₺${number.toLocaleString('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function percent(value) {
  const number = numberValue(value);

  if (number === null) return '—';

  return `${number > 0 ? '+' : ''}${number.toFixed(2)}%`;
}

export default function BistWatchlist({ userId }) {
  const [items, setItems] = useState([]);
  const [prices, setPrices] = useState({});
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState('');

  useEffect(() => {
    if (!userId) return undefined;

    return onSnapshot(
      collection(
        firestoreDb,
        'users',
        userId,
        'bistWatchlist'
      ),
      (snapshot) => {
        const next = snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        }));

        next.sort((a, b) => {
          const first = Number(a.order);
          const second = Number(b.order);

          if (
            Number.isFinite(first) &&
            Number.isFinite(second)
          ) {
            return first - second;
          }

          return String(a.code || '').localeCompare(
            String(b.code || '')
          );
        });

        setItems(next);
      }
    );
  }, [userId]);

  const codes = useMemo(
    () =>
      items
        .map((item) =>
          String(item.code || '')
            .trim()
            .toUpperCase()
        )
        .filter(Boolean),
    [items]
  );

  const refreshPrices = useCallback(async () => {
    if (!codes.length) {
      setPrices({});
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/prices', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
        body: JSON.stringify({
          market: 'bist',
          codes,
        }),
      });

      if (!response.ok) {
        throw new Error(
          `Fiyat servisi ${response.status}`
        );
      }

      const data = await response.json();
      setPrices(data?.prices || {});

      setUpdatedAt(
        new Intl.DateTimeFormat('tr-TR', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }).format(new Date())
      );
    } catch (error) {
      console.error(
        'BIST takip fiyat hatası:',
        error
      );
    } finally {
      setLoading(false);
    }
  }, [codes]);

  useEffect(() => {
    refreshPrices();

    const timer = window.setInterval(
      refreshPrices,
      30000
    );

    return () => window.clearInterval(timer);
  }, [refreshPrices]);

  async function addSymbol() {
    const input = window.prompt(
      'BIST hisse kodunu yazın:',
      'AKBNK'
    );

    if (input === null) return;

    const code = String(input)
      .trim()
      .toUpperCase();

    if (!/^[A-Z0-9]{1,12}$/.test(code)) {
      window.alert('Geçerli bir BIST kodu yazın.');
      return;
    }

    if (
      items.some(
        (item) =>
          String(item.code || '')
            .trim()
            .toUpperCase() === code
      )
    ) {
      window.alert(`${code} zaten listede.`);
      return;
    }

    await addDoc(
      collection(
        firestoreDb,
        'users',
        userId,
        'bistWatchlist'
      ),
      {
        code,
        market: 'bist',
        order: items.length,
        createdAt: new Date().toISOString(),
      }
    );
  }

  async function removeSymbol(item) {
    const code = String(item.code || '')
      .trim()
      .toUpperCase();

    if (
      !window.confirm(
        `${code} BIST takip listesinden çıkarılsın mı?`
      )
    ) {
      return;
    }

    await deleteDoc(
      doc(
        firestoreDb,
        'users',
        userId,
        'bistWatchlist',
        item.id
      )
    );
  }

  const half = Math.ceil(items.length / 2);
  const panes = [
    items.slice(0, half),
    items.slice(half),
  ];

  function renderTable(list, paneIndex) {
    return (
      <div
        className="tablePane"
        key={paneIndex}
      >
        <table>
          <thead>
            <tr>
              <th>Hisse</th>
              <th>Son</th>
              <th>Düşük</th>
              <th>Yüksek</th>
              <th>% Değişim</th>
              <th>İşlem</th>
            </tr>
          </thead>

          <tbody>
            {list.map((item) => {
              const code = String(item.code || '')
                .trim()
                .toUpperCase();

              const quote = prices[code] || {};
              const change = numberValue(
                quote.changePercent
              );

              return (
                <tr key={item.id}>
                  <td className="symbol">
                    ☆ {code}
                  </td>

                  <td>{money(quote.price)}</td>
                  <td>{money(quote.dayLow)}</td>
                  <td>{money(quote.dayHigh)}</td>

                  <td
                    className={
                      change === null
                        ? ''
                        : change >= 0
                          ? 'positive'
                          : 'negative'
                    }
                  >
                    {percent(change)}
                  </td>

                  <td>
                    <button
                      type="button"
                      className="remove"
                      onClick={() =>
                        removeSymbol(item)
                      }
                      title={`${code} listesinden çıkar`}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <section className="bistWatch">
      <style jsx>{`
        .bistWatch {
          width: 100%;
          max-width: 1600px;
          margin: 0 0 28px;
          padding: 11px;
          border: 1px solid
            rgba(212,175,55,0.22);
          border-radius: 16px;
          background: #17130c;
          box-sizing: border-box;
          overflow-x: auto;
        }

        .top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 8px;
        }

        h2 {
          margin: 0;
          color: #f8fafc;
          font-size: 18px;
        }

        .actions {
          display: flex;
          align-items: center;
          gap: 7px;
        }

        .status {
          color: #94a3b8;
          font-size: 10px;
        }

        button {
          min-height: 29px;
          padding: 0 10px;
          border: 1px solid
            rgba(212,175,55,0.42);
          border-radius: 7px;
          color: #f0d675;
          background: #151109;
          font-weight: 850;
          cursor: pointer;
        }

        .tables {
          display: grid;
          grid-template-columns:
            repeat(2, minmax(510px, 1fr));
          gap: 24px;
          min-width: 1050px;
        }

        table {
          width: 100%;
          table-layout: fixed;
          border-collapse: collapse;
        }

        th {
          padding: 5px 6px;
          border-bottom: 1px solid
            rgba(148,163,184,0.24);
          color: #94a3b8;
          font-size: 9px;
          font-weight: 900;
          text-align: left;
          white-space: nowrap;
        }

        td {
          height: 31px;
          padding: 3px 6px;
          border-bottom: 1px solid
            rgba(212,175,55,0.10);
          color: #e2e8f0;
          font-size: 10px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        th:nth-child(1),
        td:nth-child(1) {
          width: 18%;
        }

        th:nth-child(2),
        td:nth-child(2) {
          width: 20%;
        }

        th:nth-child(3),
        td:nth-child(3),
        th:nth-child(4),
        td:nth-child(4) {
          width: 13%;
        }

        th:nth-child(5),
        td:nth-child(5) {
          width: 17%;
        }

        th:nth-child(6),
        td:nth-child(6) {
          width: 9%;
          text-align: center;
        }

        tbody tr:hover {
          background:
            rgba(56,189,248,0.055);
        }

        .symbol {
          color: #f8fafc;
          font-size: 12px;
          font-weight: 900;
        }

        .positive {
          color: #22c55e;
          font-weight: 900;
        }

        .negative {
          color: #ef4444;
          font-weight: 900;
        }

        .remove {
          width: 22px;
          min-width: 22px;
          height: 21px;
          min-height: 21px;
          padding: 0;
          border-color:
            rgba(239,68,68,0.55);
          color: #fca5a5;
          background:
            rgba(127,29,29,0.35);
          font-size: 14px;
          line-height: 1;
        }

        .empty {
          padding: 30px;
          color: #94a3b8;
          text-align: center;
        }

        @media (max-width: 700px) {
          .tables {
            grid-template-columns:
              minmax(510px, 1fr);
          }

          .tablePane:nth-child(2):empty {
            display: none;
          }

          h2 {
            font-size: 16px;
          }

          .status {
            display: none;
          }
        }
      `}</style>

      <div className="top">
        <div>
          <h2>BIST Takip</h2>
          <span className="status">
            {updatedAt
              ? `Son güncelleme: ${updatedAt}`
              : 'Fiyatlar bekleniyor…'}
          </span>
        </div>

        <div className="actions">
          <span className="status">
            {items.length} hisse
          </span>

          <button
            type="button"
            onClick={refreshPrices}
            disabled={loading}
          >
            {loading ? '…' : '↻'}
          </button>

          <button
            type="button"
            onClick={addSymbol}
          >
            + Ekle
          </button>
        </div>
      </div>

      {items.length ? (
        <div className="tables">
          {panes.map(renderTable)}
        </div>
      ) : (
        <div className="empty">
          “+ Ekle” ile BIST hissesi ekleyebilirsiniz.
        </div>
      )}
    </section>
  );
}
