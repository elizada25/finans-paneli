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
import BistMarketMovers from './BistMarketMovers';
import BistSeasonality from './BistSeasonality';

const COLUMNS =
  'minmax(82px,1.2fr) minmax(94px,1fr) 66px 66px 72px 32px';

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

const cellStyle = {
  minWidth: 0,
  overflow: 'hidden',
  color: '#e2e8f0',
  fontSize: '13px',
  lineHeight: 1,
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

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

        next.sort((first, second) => {
          const firstOrder = Number(first.order);
          const secondOrder = Number(second.order);

          if (
            Number.isFinite(firstOrder) &&
            Number.isFinite(secondOrder)
          ) {
            return firstOrder - secondOrder;
          }

          return String(first.code || '').localeCompare(
            String(second.code || '')
          );
        });

        setItems(next);
      },
      (error) => {
        console.error(
          'BIST takip listesi okunamadı:',
          error
        );
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

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error ||
          `Fiyat servisi ${response.status}`
        );
      }

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

    try {
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
    } catch (error) {
      window.alert(
        `Hisse eklenemedi: ${
          error?.message || 'Bilinmeyen hata'
        }`
      );
    }
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

    try {
      await deleteDoc(
        doc(
          firestoreDb,
          'users',
          userId,
          'bistWatchlist',
          item.id
        )
      );
    } catch (error) {
      window.alert(
        `Hisse silinemedi: ${
          error?.message || 'Bilinmeyen hata'
        }`
      );
    }
  }

  const paneCount =
    items.length > 8 ? 2 : 1;

  const half =
    paneCount === 2
      ? Math.ceil(items.length / 2)
      : items.length;

  const panes =
    paneCount === 2
      ? [
          items.slice(0, half),
          items.slice(half),
        ]
      : [items];

  function renderPane(list, paneIndex) {
    return (
      <div
        key={paneIndex}
        style={{
          minWidth: '520px',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: COLUMNS,
            gap: '6px',
            alignItems: 'center',
            minHeight: '25px',
            padding: '0 6px',
            borderBottom:
              '1px solid rgba(148,163,184,0.25)',
            color: '#94a3b8',
            fontSize: '12px',
            fontWeight: 900,
            boxSizing: 'border-box',
          }}
        >
          <span>Hisse</span>
          <span>Son</span>
          <span>Düşük</span>
          <span>Yüksek</span>
          <span>% Değişim</span>
          <span></span>
        </div>

        {list.map((item) => {
          const code = String(item.code || '')
            .trim()
            .toUpperCase();

          const quote = prices[code] || {};
          const change = numberValue(
            quote.changePercent
          );

          return (
            <div
              key={item.id}
              className="bistMatrixRow"
              style={{
                display: 'grid',
                gridTemplateColumns: COLUMNS,
                gap: '6px',
                alignItems: 'center',
                minHeight: '31px',
                padding: '3px 6px',
                borderBottom:
                  '1px solid rgba(52,211,153,0.11)',
                boxSizing: 'border-box',
              }}
            >
              <strong
                style={{
                  ...cellStyle,
                  color: '#f8fafc',
                  fontSize: '14px',
                  fontWeight: 900,
                }}
              >
                ☆ {code}
              </strong>

              <span style={cellStyle}>
                {money(quote.price)}
              </span>

              <span style={cellStyle}>
                {money(quote.dayLow)}
              </span>

              <span style={cellStyle}>
                {money(quote.dayHigh)}
              </span>

              <strong
                style={{
                  ...cellStyle,
                  color:
                    change === null
                      ? '#94a3b8'
                      : change >= 0
                        ? '#22c55e'
                        : '#ef4444',
                  fontWeight: 900,
                }}
              >
                {percent(change)}
              </strong>

              <button
                type="button"
                onClick={() =>
                  removeSymbol(item)
                }
                title={`${code} listesinden çıkar`}
                style={{
                  width: '22px',
                  minWidth: '22px',
                  height: '21px',
                  minHeight: '21px',
                  padding: 0,
                  border:
                    '1px solid rgba(239,68,68,0.55)',
                  borderRadius: '4px',
                  color: '#fca5a5',
                  background:
                    'rgba(127,29,29,0.35)',
                  fontSize: '14px',
                  fontWeight: 900,
                  lineHeight: 1,
                  cursor: 'pointer',
                }}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <>
    <section
      style={{
        width: '100%',
        maxWidth: '1600px',
        minHeight: 0,
        margin: '0 0 28px',
        padding: '11px',
        overflowX: 'auto',
        border:
          '1px solid rgba(52,211,153,0.22)',
        borderRadius: '16px',
        background: '#111821',
        boxSizing: 'border-box',
      }}
    >
      <style jsx global>{`
        .bistMatrixRow:hover {
          background:
            rgba(56,189,248,0.055);
        }
      `}</style>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          marginBottom: '8px',
        }}
      >
        <div>
          <h2
            style={{
              margin: 0,
              color: '#f8fafc',
              fontSize: '18px',
            }}
          >
            BIST Takip
          </h2>

          <span
            style={{
              color: '#94a3b8',
              fontSize: '13px',
            }}
          >
            {updatedAt
              ? `Son güncelleme: ${updatedAt}`
              : 'Fiyatlar bekleniyor…'}
          </span>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '7px',
          }}
        >
          <span
            style={{
              color: '#94a3b8',
              fontSize: '13px',
            }}
          >
            {items.length} hisse
          </span>

          <button
            type="button"
            onClick={refreshPrices}
            disabled={loading}
            style={{
              minWidth: '31px',
              height: '29px',
              border:
                '1px solid rgba(52,211,153,0.42)',
              borderRadius: '7px',
              color: '#6ee7b7',
              background: '#101720',
              cursor: 'pointer',
            }}
          >
            {loading ? '…' : '↻'}
          </button>

          <button
            type="button"
            onClick={addSymbol}
            style={{
              height: '29px',
              padding: '0 10px',
              border:
                '1px solid rgba(52,211,153,0.42)',
              borderRadius: '7px',
              color: '#6ee7b7',
              background: '#101720',
              fontWeight: 850,
              cursor: 'pointer',
            }}
          >
            + Ekle
          </button>
        </div>
      </div>

      {items.length ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns:
              paneCount === 2
                ? 'repeat(2,minmax(520px,1fr))'
                : 'minmax(520px,820px)',
            gap: '24px',
            minWidth:
              paneCount === 2
                ? '1064px'
                : '520px',
          }}
        >
          {panes.map(renderPane)}
        </div>
      ) : (
        <div
          style={{
            padding: '28px',
            color: '#94a3b8',
            fontSize: '14px',
            textAlign: 'center',
          }}
        >
          “+ Ekle” ile BIST hissesi ekleyebilirsiniz.
        </div>
      )}
    </section>
    <BistMarketMovers />
    <BistSeasonality />
    </>
  );
}
