'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

const GROUPS = [
  ['Avrupa', '🇪🇺 Avrupa Borsaları'],
  ['Asya', '🌏 Asya Borsaları'],
  ['ABD Vadeli', '🇺🇸 ABD Vadeli Endeksleri'],
];

function formatNumber(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) return '—';

  return number.toLocaleString('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatPercent(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) return '—';

  return (
    `${number > 0 ? '+' : ''}` +
    `${number.toFixed(2)}%`
  );
}

function formatClock(value) {
  if (!value) return '—';

  try {
    return new Intl.DateTimeFormat(
      'tr-TR',
      {
        timeZone: 'Europe/Istanbul',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }
    ).format(new Date(value));
  } catch {
    return '—';
  }
}

function marketStatus(value) {
  const state = String(value || '').toUpperCase();

  if (
    state === 'REGULAR' ||
    state === 'OPEN'
  ) {
    return {
      label: 'Açık',
      color: '#4ade80',
    };
  }

  if (
    state === 'PRE' ||
    state === 'PREPRE'
  ) {
    return {
      label: 'Seans öncesi',
      color: '#7dd3fc',
    };
  }

  if (
    state === 'POST' ||
    state === 'POSTPOST'
  ) {
    return {
      label: 'Seans sonrası',
      color: '#d8b4fe',
    };
  }

  return {
    label: 'Kapalı / beklemede',
    color: '#94a3b8',
  };
}

export default function GlobalMarkets() {
  const [items, setItems] = useState([]);
  const [generatedAt, setGeneratedAt] =
    useState('');
  const [loading, setLoading] =
    useState(true);
  const [error, setError] =
    useState('');

  const loadMarkets = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch(
        '/api/global-markets',
        {
          cache: 'no-store',
        }
      );

      const data = await response.json();

      if (!response.ok || data?.ok === false) {
        throw new Error(
          data?.error ||
          'Piyasa verileri alınamadı.'
        );
      }

      setItems(
        Array.isArray(data.items)
          ? data.items
          : []
      );

      setGeneratedAt(
        data.generatedAt || ''
      );
    } catch (loadError) {
      setError(
        loadError?.message ||
        'Piyasa verileri alınamadı.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMarkets();

    const timer = window.setInterval(
      loadMarkets,
      5 * 60 * 1000
    );

    return () =>
      window.clearInterval(timer);
  }, [loadMarkets]);

  const positiveCount = useMemo(
    () =>
      items.filter(
        (item) =>
          Number(item.changePercent) > 0
      ).length,
    [items]
  );

  const negativeCount = useMemo(
    () =>
      items.filter(
        (item) =>
          Number(item.changePercent) < 0
      ).length,
    [items]
  );

  return (
    <section className="globalMarkets">
      <style jsx>{`
        .globalMarkets {
          width: 100%;
          max-width: 1600px;
          margin: 0 auto 28px;
          color: #f8fafc;
        }

        .hero {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 18px;
          margin-bottom: 18px;
          padding: 20px;
          border: 1px solid
            rgba(56, 189, 248, 0.25);
          border-radius: 16px;
          background:
            linear-gradient(
              135deg,
              rgba(14, 116, 144, 0.14),
              rgba(15, 23, 42, 0.92)
            );
        }

        .hero h2 {
          margin: 0 0 6px;
          color: #7dd3fc;
          font-size: 22px;
        }

        .hero p {
          margin: 0;
          color: #94a3b8;
          font-size: 12px;
          line-height: 1.6;
        }

        .heroActions {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }

        .summary {
          padding: 9px 12px;
          border: 1px solid
            rgba(148, 163, 184, 0.18);
          border-radius: 10px;
          color: #cbd5e1;
          background:
            rgba(255, 255, 255, 0.035);
          font-size: 11px;
          white-space: nowrap;
        }

        .refresh {
          min-height: 38px;
          padding: 0 14px;
          border: 1px solid
            rgba(212, 175, 55, 0.42);
          border-radius: 10px;
          color: #f0d675;
          background:
            rgba(212, 175, 55, 0.1);
          font-weight: 850;
          cursor: pointer;
        }

        .refresh:disabled {
          opacity: 0.55;
          cursor: default;
        }

        .group {
          margin-bottom: 22px;
        }

        .groupTitle {
          margin: 0 0 11px;
          color: #f0d675;
          font-size: 15px;
        }

        .grid {
          display: grid;
          grid-template-columns:
            repeat(
              auto-fit,
              minmax(230px, 1fr)
            );
          gap: 12px;
        }

        .card {
          display: block;
          min-width: 0;
          padding: 16px;
          border: 1px solid
            rgba(212, 175, 55, 0.18);
          border-radius: 14px;
          color: inherit;
          text-decoration: none;
          background: #17130c;
          transition:
            transform 150ms ease,
            border-color 150ms ease;
        }

        .card:hover {
          transform: translateY(-2px);
          border-color:
            rgba(56, 189, 248, 0.45);
        }

        .cardTop {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 10px;
        }

        .name {
          display: block;
          color: #f8fafc;
          font-size: 14px;
        }

        .country {
          display: block;
          margin-top: 4px;
          color: #64748b;
          font-size: 10px;
        }

        .status {
          font-size: 9px;
          font-weight: 800;
          white-space: nowrap;
        }

        .priceRow {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 12px;
          margin-top: 18px;
        }

        .price {
          color: #f8fafc;
          font-size: 21px;
          font-weight: 900;
        }

        .change {
          font-size: 14px;
          font-weight: 900;
        }

        .details {
          display: flex;
          justify-content: space-between;
          gap: 8px;
          margin-top: 13px;
          padding-top: 11px;
          border-top: 1px solid
            rgba(148, 163, 184, 0.11);
          color: #64748b;
          font-size: 9px;
        }

        .investing {
          margin-top: 10px;
          color: #7dd3fc;
          font-size: 9px;
          font-weight: 800;
        }

        .error {
          margin-bottom: 16px;
          padding: 13px;
          border: 1px solid
            rgba(239, 68, 68, 0.3);
          border-radius: 10px;
          color: #fca5a5;
          background:
            rgba(127, 29, 29, 0.15);
        }

        .failed {
          color: #94a3b8;
          font-size: 11px;
          line-height: 1.5;
        }

        @media (max-width: 700px) {
          .hero {
            align-items: stretch;
            flex-direction: column;
            padding: 16px;
          }

          .heroActions {
            justify-content: flex-start;
          }

          .grid {
            grid-template-columns:
              repeat(2, minmax(0, 1fr));
            gap: 8px;
          }

          .card {
            padding: 12px;
          }

          .price {
            font-size: 16px;
          }

          .change {
            font-size: 11px;
          }

          .details {
            align-items: flex-start;
            flex-direction: column;
          }
        }

        @media (max-width: 430px) {
          .grid {
            grid-template-columns: 1fr;
          }
        }

        /* Dünya piyasaları tek sütun ve satır görünümü */
        .grid {
          display: flex !important;
          flex-direction: column !important;
          gap: 7px !important;
        }

        .card {
          display: grid !important;
          grid-template-columns:
            minmax(190px, 1.45fr)
            minmax(110px, 0.7fr)
            minmax(90px, 0.6fr)
            minmax(125px, 0.75fr)
            minmax(170px, 0.9fr) !important;
          align-items: center !important;
          gap: 14px !important;
          min-height: 67px !important;
          padding: 12px 16px !important;
        }

        .cardTop,
        .priceRow {
          display: contents !important;
        }

        .cardTop > div {
          grid-column: 1;
        }

        .price {
          grid-column: 2;
          font-size: 16px !important;
        }

        .change {
          grid-column: 3;
          font-size: 13px !important;
        }

        .status {
          grid-column: 4;
        }

        .details {
          display: block !important;
          grid-column: 5;
          margin: 0 !important;
          padding: 0 !important;
          border: 0 !important;
          color: #cbd5e1 !important;
          text-align: right;
        }

        .details span {
          display: none !important;
        }

        .details span:last-child {
          display: block !important;
          font-size: 10px !important;
          font-weight: 750;
          white-space: nowrap;
        }

        .investing {
          display: none !important;
        }

        .failed {
          grid-column: 2 / 6;
        }

        @media (max-width: 700px) {
          .card {
            grid-template-columns:
              minmax(0, 1fr)
              auto !important;
            gap: 6px 10px !important;
            padding: 12px !important;
          }

          .cardTop > div {
            grid-column: 1;
            grid-row: 1;
          }

          .status {
            grid-column: 2;
            grid-row: 1;
            text-align: right;
          }

          .price {
            grid-column: 1;
            grid-row: 2;
          }

          .change {
            grid-column: 2;
            grid-row: 2;
            text-align: right;
          }

          .details {
            grid-column: 1 / -1;
            grid-row: 3;
            padding-top: 7px !important;
            border-top:
              1px solid rgba(148,163,184,0.09) !important;
            text-align: left;
          }

          .failed {
            grid-column: 1 / -1;
          }
        }


        /* SKY-MARKETS-SAFE-TABLE-START */
        .group {
          margin-bottom: 13px !important;
        }

        .grid {
          display: block !important;
          gap: 0 !important;
          overflow-x: auto !important;
          border:
            1px solid rgba(212,175,55,0.18) !important;
          border-radius: 9px !important;
          background: #17130c !important;
        }

        .card {
          display: grid !important;
          grid-template-columns:
            minmax(170px, 1.3fr)
            minmax(105px, 0.7fr)
            minmax(85px, 0.55fr)
            minmax(165px, 0.8fr) !important;
          align-items: center !important;
          gap: 11px !important;
          min-width: 570px !important;
          min-height: 36px !important;
          padding: 5px 11px !important;
          border: 0 !important;
          border-bottom:
            1px solid rgba(148,163,184,0.10) !important;
          border-radius: 0 !important;
          background: transparent !important;
          transform: none !important;
          box-sizing: border-box !important;
        }

        .card:last-child {
          border-bottom: 0 !important;
        }

        .card:hover {
          background:
            rgba(56,189,248,0.05) !important;
        }

        .cardTop,
        .priceRow {
          display: contents !important;
        }

        .cardTop > div {
          grid-column: 1 !important;
        }

        .price {
          grid-column: 2 !important;
          font-size: 10px !important;
        }

        .change {
          grid-column: 3 !important;
          font-size: 9px !important;
        }

        .status {
          display: none !important;
        }

        .details {
          display: block !important;
          grid-column: 4 !important;
          margin: 0 !important;
          padding: 0 !important;
          border: 0 !important;
          text-align: right !important;
        }

        .details span {
          display: none !important;
        }

        .details span:last-child {
          display: block !important;
          color: #cbd5e1 !important;
          font-size: 8px !important;
          font-weight: 750 !important;
          white-space: nowrap !important;
        }

        .name {
          font-size: 10px !important;
        }

        .country {
          margin-top: 1px !important;
          font-size: 8px !important;
        }

        .investing {
          display: none !important;
        }

        .failed {
          grid-column: 2 / 5 !important;
          font-size: 8px !important;
        }
        /* SKY-MARKETS-SAFE-TABLE-END */

      `}</style>

      <div className="hero">
        <div>
          <h2>🌍 Sabah Piyasa Radarı</h2>
          <p>
            Avrupa, Asya ve ABD vadeli
            endekslerini tek ekrandan izle.
            Veriler 5 dakikada bir yenilenir.
          </p>
        </div>

        <div className="heroActions">
          <span className="summary">
            <b style={{ color: '#4ade80' }}>
              {positiveCount} pozitif
            </b>
            {' • '}
            <b style={{ color: '#f87171' }}>
              {negativeCount} negatif
            </b>
          </span>

          <span className="summary">
            Güncelleme: {formatClock(generatedAt)}
          </span>

          <button
            className="refresh"
            type="button"
            disabled={loading}
            onClick={loadMarkets}
          >
            {loading
              ? 'Yükleniyor…'
              : '↻ Yenile'}
          </button>
        </div>
      </div>

      {error ? (
        <div className="error">{error}</div>
      ) : null}

      {GROUPS.map(([groupKey, groupTitle]) => {
        const groupItems = items.filter(
          (item) =>
            item.group === groupKey
        );

        return (
          <div
            className="group"
            key={groupKey}
          >
            <h3 className="groupTitle">
              {groupTitle}
            </h3>

            <div className="grid">
              {groupItems.map((item) => {
                const status =
                  marketStatus(
                    item.marketState
                  );

                const change =
                  Number(item.changePercent);

                const color =
                  Number.isFinite(change)
                    ? change >= 0
                      ? '#4ade80'
                      : '#f87171'
                    : '#94a3b8';

                return (
                  <a
                    className="card"
                    key={item.id}
                    href={item.investingUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <div className="cardTop">
                      <div>
                        <strong className="name">
                          {item.name}
                        </strong>

                        <span className="country">
                          {item.country}
                        </span>
                      </div>

                      <span
                        className="status"
                        style={{
                          color: status.color,
                        }}
                      >
                        ● {status.label}
                      </span>
                    </div>

                    {item.ok === false ? (
                      <p className="failed">
                        {item.error ||
                          'Veri alınamadı.'}
                      </p>
                    ) : (
                      <>
                        <div className="priceRow">
                          <span className="price">
                            {formatNumber(
                              item.price
                            )}
                          </span>

                          <span
                            className="change"
                            style={{ color }}
                          >
                            {formatPercent(
                              item.changePercent
                            )}
                          </span>
                        </div>

                        <div className="details">
                          <span>
                            Düşük:{' '}
                            {formatNumber(
                              item.dayLow
                            )}
                          </span>

                          <span>
                            Yüksek:{' '}
                            {formatNumber(
                              item.dayHigh
                            )}
                          </span>

                          <span>
                            Saat:{' '}
                            {formatClock(
                              item.dataTime
                            )}
                          </span>
                        </div>
                      </>
                    )}

                    <div className="investing">
                      Investing.com’da aç ↗
                    </div>
                  </a>
                );
              })}
            </div>
          </div>
        );
      })}
    </section>
  );
}
