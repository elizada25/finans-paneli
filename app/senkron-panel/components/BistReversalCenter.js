'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import BistReversalPaperRobot from './BistReversalPaperRobot';

function number(value) {
  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

function money(value) {
  const parsed = number(value);

  if (parsed === null) return '—';

  return new Intl.NumberFormat(
    'tr-TR',
    {
      style: 'currency',
      currency: 'TRY',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }
  ).format(parsed);
}

function percent(value) {
  const parsed = number(value);

  if (parsed === null) return '—';

  return (
    `${parsed > 0 ? '+' : ''}` +
    `${parsed.toFixed(2)}%`
  );
}

function dateTime(value) {
  if (!value) return '—';

  return new Intl.DateTimeFormat(
    'tr-TR',
    {
      timeZone: 'Europe/Istanbul',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }
  ).format(new Date(value));
}

function statusColor(status) {
  if (
    status ===
    'DÖNÜŞ TEYİT EDİLDİ'
  ) {
    return '#22c55e';
  }

  if (
    status === 'DÖNÜŞ ADAYI'
  ) {
    return '#38bdf8';
  }

  if (
    status === 'DİP ARANIYOR'
  ) {
    return '#facc15';
  }

  return '#94a3b8';
}

export default function BistReversalCenter({ userId }) {
  const [data, setData] =
    useState(null);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState('');

  const [selectedSymbol, setSelectedSymbol] =
    useState('');

  const [minimumScore, setMinimumScore] =
    useState(45);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch(
        '/api/bist-reversal',
        {
          cache: 'no-store',
        }
      );

      const payload =
        await response.json();

      if (
        !response.ok ||
        payload?.ok !== true
      ) {
        throw new Error(
          payload?.error ||
          `HTTP ${response.status}`
        );
      }

      setData(payload);

      setSelectedSymbol(
        (current) =>
          current ||
          payload.items?.[0]
            ?.symbol ||
          ''
      );
    } catch (loadError) {
      setError(
        loadError?.message ||
        'Radar yüklenemedi.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();

    const timer =
      window.setInterval(
        load,
        5 * 60 * 1000
      );

    return () =>
      window.clearInterval(timer);
  }, [load]);

  const items = useMemo(
    () =>
      (data?.items || []).filter(
        (item) =>
          Number(item.score) >=
          minimumScore
      ),
    [data, minimumScore]
  );

  const selected =
    (data?.items || []).find(
      (item) =>
        item.symbol ===
        selectedSymbol
    ) ||
    items[0] ||
    null;

  return (
    <section className="reversal">
      <style jsx>{`
        .reversal {
          width: 100%;
          max-width: 1600px;
          margin: 0 auto 28px;
          color: #f8fafc;
        }

        .hero,
        .detail,
        .tableWrap {
          border:
            1px solid
            rgba(52,211,153,0.25);
          border-radius: 15px;
          background: #111821;
        }

        .hero {
          display: flex;
          align-items: center;
          justify-content:
            space-between;
          gap: 14px;
          flex-wrap: wrap;
          padding: 18px;
          margin-bottom: 12px;
        }

        h2,
        h3,
        p {
          margin-top: 0;
        }

        h2 {
          margin-bottom: 7px;
          font-size: 25px;
        }

        .muted {
          color: #94a3b8;
          font-size: 13px;
        }

        .actions {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }

        button,
        select {
          min-height: 40px;
          padding: 0 12px;
          border:
            1px solid
            rgba(52,211,153,0.35);
          border-radius: 9px;
          color: #f8fafc;
          background: #111827;
          font-family: inherit;
          font-weight: 850;
          cursor: pointer;
        }

        .summary {
          display: grid;
          grid-template-columns:
            repeat(
              4,
              minmax(0, 1fr)
            );
          gap: 10px;
          margin-bottom: 12px;
        }

        .summaryCard {
          padding: 14px;
          border:
            1px solid
            rgba(52,211,153,0.22);
          border-radius: 13px;
          background: #111821;
        }

        .summaryCard span {
          display: block;
          margin-bottom: 6px;
          color: #94a3b8;
          font-size: 12px;
        }

        .summaryCard strong {
          font-size: 21px;
        }

        .tableWrap {
          overflow-x: auto;
          margin-bottom: 12px;
          padding: 10px;
        }

        table {
          width: 100%;
          min-width: 1050px;
          border-collapse: collapse;
        }

        th,
        td {
          padding: 10px 8px;
          border-bottom:
            1px solid
            rgba(148,163,184,0.12);
          text-align: left;
          white-space: nowrap;
          font-size: 12px;
        }

        th {
          color: #94a3b8;
          font-size: 10px;
        }

        tbody tr {
          cursor: pointer;
        }

        tbody tr:hover,
        tbody tr.selected {
          background:
            rgba(56,189,248,0.07);
        }

        .score {
          font-size: 15px;
          font-weight: 900;
        }

        .detail {
          padding: 18px;
        }

        .detailGrid {
          display: grid;
          grid-template-columns:
            repeat(
              5,
              minmax(0, 1fr)
            );
          gap: 9px;
          margin-bottom: 16px;
        }

        .detailCard {
          padding: 12px;
          border:
            1px solid
            rgba(148,163,184,0.15);
          border-radius: 11px;
          background:
            rgba(15,23,42,0.65);
        }

        .detailCard span {
          display: block;
          margin-bottom: 6px;
          color: #94a3b8;
          font-size: 11px;
        }

        .detailCard strong {
          font-size: 16px;
        }

        .reasonGrid {
          display: grid;
          grid-template-columns:
            repeat(
              2,
              minmax(0, 1fr)
            );
          gap: 12px;
        }

        .reasonBox {
          padding: 14px;
          border-radius: 12px;
          background:
            rgba(15,23,42,0.55);
        }

        .reasonBox ul {
          margin: 8px 0 0;
          padding-left: 20px;
        }

        .reasonBox li {
          margin: 6px 0;
          color: #cbd5e1;
          font-size: 13px;
        }

        .error {
          padding: 16px;
          margin-bottom: 12px;
          border:
            1px solid
            rgba(239,68,68,0.4);
          border-radius: 12px;
          color: #fca5a5;
          background:
            rgba(127,29,29,0.2);
        }

        @media (max-width: 760px) {
          .hero {
            padding: 14px;
          }

          .summary {
            grid-template-columns:
              repeat(
                2,
                minmax(0, 1fr)
              );
          }

          .detailGrid {
            grid-template-columns:
              repeat(
                2,
                minmax(0, 1fr)
              );
          }

          .reasonGrid {
            grid-template-columns: 1fr;
          }

          .tableWrap {
            padding: 6px;
          }

          th,
          td {
            padding: 9px 7px;
            font-size: 11px;
          }
        }
      `}</style>

      <div className="hero">
        <div>
          <h2>↩ BIST Dönüş Radarı</h2>

          <p className="muted">
            RSI, MACD, EMA, destek,
            fiyat teyidi ve hacimle
            günlük dönüş taraması
          </p>
        </div>

        <div className="actions">
          <select
            value={minimumScore}
            onChange={(event) =>
              setMinimumScore(
                Number(
                  event.target.value
                )
              )
            }
          >
            <option value={0}>
              Tüm hisseler
            </option>
            <option value={45}>
              45+ puan
            </option>
            <option value={65}>
              Dönüş adayları
            </option>
            <option value={80}>
              Teyit edilenler
            </option>
          </select>

          <button
            type="button"
            onClick={load}
            disabled={loading}
          >
            {loading
              ? 'Taranıyor…'
              : '↻ Yenile'}
          </button>
        </div>
      </div>

      {error ? (
        <div className="error">
          {error}
        </div>
      ) : null}

      <div className="summary">
        <div className="summaryCard">
          <span>Taranan</span>
          <strong>
            {data?.analyzed ?? '—'}
          </strong>
        </div>

        <div className="summaryCard">
          <span>Dönüş teyidi</span>
          <strong
            style={{
              color: '#22c55e',
            }}
          >
            {data?.summary
              ?.confirmed ?? '—'}
          </strong>
        </div>

        <div className="summaryCard">
          <span>Dönüş adayı</span>
          <strong
            style={{
              color: '#38bdf8',
            }}
          >
            {data?.summary
              ?.candidates ?? '—'}
          </strong>
        </div>

        <div className="summaryCard">
          <span>Son tarama</span>
          <strong
            style={{
              fontSize: 14,
            }}
          >
            {dateTime(
              data?.generatedAt
            )}
          </strong>
        </div>
      </div>

      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              <th>Hisse</th>
              <th>Durum</th>
              <th>Puan</th>
              <th>Fiyat</th>
              <th>% Günlük</th>
              <th>RSI</th>
              <th>Hacim</th>
              <th>Destek</th>
              <th>Teyit fiyatı</th>
              <th>Veri zamanı</th>
            </tr>
          </thead>

          <tbody>
            {items.length ? (
              items.map((item) => (
                <tr
                  key={item.symbol}
                  className={
                    selected?.symbol ===
                    item.symbol
                      ? 'selected'
                      : ''
                  }
                  onClick={() =>
                    setSelectedSymbol(
                      item.symbol
                    )
                  }
                >
                  <td>
                    <strong>
                      {item.symbol}
                    </strong>
                  </td>

                  <td
                    style={{
                      color:
                        statusColor(
                          item.status
                        ),
                      fontWeight: 900,
                    }}
                  >
                    {item.status}
                  </td>

                  <td className="score">
                    {item.score}
                  </td>

                  <td>
                    {money(item.price)}
                  </td>

                  <td
                    style={{
                      color:
                        Number(
                          item.changePercent
                        ) >= 0
                          ? '#22c55e'
                          : '#ef4444',
                      fontWeight: 850,
                    }}
                  >
                    {percent(
                      item.changePercent
                    )}
                  </td>

                  <td>{item.rsi ?? '—'}</td>

                  <td>
                    {item.volumeRatio
                      ? `${item.volumeRatio}x`
                      : '—'}
                  </td>

                  <td>
                    {money(item.support)}
                  </td>

                  <td>
                    {money(
                      item.confirmationPrice
                    )}
                  </td>

                  <td>
                    {dateTime(
                      item.dataTime
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="10">
                  {loading
                    ? 'Hisseler taranıyor…'
                    : 'Seçilen puanda hisse bulunamadı.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selected ? (
        <div className="detail">
          <h3>
            {selected.symbol} dönüş planı
          </h3>

          <div className="detailGrid">
            <div className="detailCard">
              <span>Güncel fiyat</span>
              <strong>
                {money(selected.price)}
              </strong>
            </div>

            <div className="detailCard">
              <span>Teyit seviyesi</span>
              <strong>
                {money(
                  selected.confirmationPrice
                )}
              </strong>
            </div>

            <div className="detailCard">
              <span>Stop</span>
              <strong
                style={{
                  color: '#f87171',
                }}
              >
                {money(selected.stop)}
              </strong>
            </div>

            <div className="detailCard">
              <span>Hedef 1</span>
              <strong
                style={{
                  color: '#4ade80',
                }}
              >
                {money(selected.target1)}
              </strong>
            </div>

            <div className="detailCard">
              <span>Hedef 2</span>
              <strong
                style={{
                  color: '#22c55e',
                }}
              >
                {money(selected.target2)}
              </strong>
            </div>
          </div>

          <div className="reasonGrid">
            <div className="reasonBox">
              <strong
                style={{
                  color: '#86efac',
                }}
              >
                Dönüşü destekleyenler
              </strong>

              <ul>
                {selected.reasons
                  ?.length ? (
                  selected.reasons.map(
                    (reason) => (
                      <li key={reason}>
                        ✓ {reason}
                      </li>
                    )
                  )
                ) : (
                  <li>
                    Henüz güçlü teyit yok.
                  </li>
                )}
              </ul>
            </div>

            <div className="reasonBox">
              <strong
                style={{
                  color: '#fca5a5',
                }}
              >
                Eksik koşullar
              </strong>

              <ul>
                {selected.missing
                  ?.length ? (
                  selected.missing.map(
                    (reason) => (
                      <li key={reason}>
                        × {reason}
                      </li>
                    )
                  )
                ) : (
                  <li>
                    Tüm temel koşullar
                    tamamlandı.
                  </li>
                )}
              </ul>
            </div>
          </div>
        </div>
      ) : null}

      <BistReversalPaperRobot
        userId={userId}
        marketItems={data?.items || []}
      />

      <p
        className="muted"
        style={{
          marginTop: 12,
        }}
      >
        Bu radar yatırım tavsiyesi değildir.
        İlk aşamada yalnızca takip ve
        değerlendirme amacıyla çalışır.
      </p>
    </section>
  );
}
