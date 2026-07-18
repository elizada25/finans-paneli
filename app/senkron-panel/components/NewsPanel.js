'use client';

import { useEffect, useMemo, useState } from 'react';

export default function NewsPanel({ stocks }) {
  const [news, setNews] = useState([]);
  const [status, setStatus] = useState('NASDAQ haberleri yükleniyor…');

  const nasdaqSymbols = useMemo(
    () =>
      Array.from(
        new Set(
          stocks
            .filter((stock) => stock.market !== 'bist')
            .map((stock) => String(stock.code || '').trim().toUpperCase())
            .filter(Boolean)
        )
      ).slice(0, 8),
    [stocks]
  );

  useEffect(() => {
    let cancelled = false;

    async function loadNews() {
      try {
        setStatus('NASDAQ haberleri yükleniyor…');

        const query = new URLSearchParams({
          symbols: nasdaqSymbols.join(','),
          fresh: String(Date.now()),
        });

        const response = await fetch(`/api/news?${query.toString()}`, {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache',
          },
        });

        if (!response.ok) {
          throw new Error(`Haber servisi ${response.status} hatası verdi.`);
        }

        const payload = await response.json();

        if (cancelled) return;

        const items = Array.isArray(payload.items) ? payload.items : [];
        setNews(items);
        setStatus(
          items.length > 0
            ? ''
            : 'Åu anda yeni NASDAQ haberi bulunamadı.'
        );
      } catch (error) {
        if (cancelled) return;

        console.error('NASDAQ haber yükleme hatası:', error);
        setNews([]);
        setStatus('Güncel NASDAQ haberleri şu anda alınamıyor.');
      }
    }

    loadNews();

    // Sayfa açıkken haberleri her 60 saniyede bir yeniden kontrol eder.
    const timer = window.setInterval(loadNews, 60 * 1000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [nasdaqSymbols]);

  return (
    <article style={styles.card}>
      <div style={styles.header}>
        <h3 style={styles.title}>NASDAQ Haberleri</h3>
        <span style={styles.badge}>60 sn.</span>
      </div>

      <p style={styles.description}>
        Önce portföyündeki NASDAQ hisseleri, ardından güncel genel NASDAQ ve
        ABD piyasa haberleri gösterilir.
      </p>

      <div style={styles.list}>
        {status ? <div style={styles.empty}>{status}</div> : null}

        {news.slice(0, 8).map((item) => (
          <a
            key={`${item.link}-${item.publishedAt}`}
            href={item.link}
            target="_blank"
            rel="noreferrer"
            style={styles.row}
          >
            <div style={styles.textArea}>
              <strong style={styles.primary}>{item.title}</strong>
              <span style={styles.secondary}>
                {item.source || 'Finans Haberi'} · {item.timeLabel || 'Yeni'}
              </span>
            </div>

            <span style={styles.market}>
              {item.category || 'NASDAQ'}
            </span>
          </a>
        ))}
      </div>
    </article>
  );
}

const styles = {
  card: {
    minWidth: 0,
    minHeight: '250px',
    background: '#111e31',
    border: '1px solid rgba(148,163,184,0.16)',
    borderRadius: '16px',
    padding: '18px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '10px',
  },
  title: {
    margin: 0,
    color: '#f8fafc',
    fontSize: '18px',
  },
  badge: {
    border: '1px solid rgba(56,189,248,0.35)',
    borderRadius: '999px',
    padding: '5px 10px',
    background: 'rgba(56,189,248,0.12)',
    color: '#7dd3fc',
    fontSize: '11px',
    fontWeight: 700,
  },
  description: {
    margin: '0 0 12px',
    color: '#94a3b8',
    fontSize: '12px',
    lineHeight: 1.5,
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
  },
  empty: {
    color: '#94a3b8',
    padding: '12px 0',
    fontSize: '12px',
    lineHeight: 1.5,
  },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '10px',
    padding: '10px 0',
    borderBottom: '1px solid rgba(148,163,184,0.10)',
    color: 'inherit',
    textDecoration: 'none',
  },
  textArea: {
    minWidth: 0,
  },
  primary: {
    display: 'block',
    color: '#e2e8f0',
    fontSize: '12px',
    lineHeight: 1.4,
  },
  secondary: {
    display: 'block',
    marginTop: '4px',
    color: '#64748b',
    fontSize: '10px',
  },
  market: {
    flexShrink: 0,
    borderRadius: '999px',
    padding: '4px 8px',
    background: 'rgba(56,189,248,0.10)',
    color: '#7dd3fc',
    fontSize: '9px',
    fontWeight: 700,
  },
};