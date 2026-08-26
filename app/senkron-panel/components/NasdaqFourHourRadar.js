'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

const FILTERS = [
  ['45', '45+ puan'],
  ['60', '60+ puan'],
  ['75', '75+ sinyal'],
];

function money(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(number);
}

function percent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return `${number > 0 ? '+' : ''}${number.toFixed(2)}%`;
}

function number(value, suffix = '') {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? `${parsed.toFixed(2)}${suffix}` : '—';
}

function dateTime(value) {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat('tr-TR', {
      timeZone: 'Europe/Istanbul',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  } catch {
    return '—';
  }
}

function setupColor(setup) {
  if (setup === 'İŞLEM SİNYALİ') return '#22c55e';
  if (setup === 'ONAY BEKLİYOR') return '#facc15';
  if (setup === 'İZLE') return '#38bdf8';
  return '#94a3b8';
}

export default function NasdaqFourHourRadar() {
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [minimumScore, setMinimumScore] = useState('45');
  const [selectedSymbol, setSelectedSymbol] = useState('');

  const load = useCallback(async (force = false) => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch(
        `/api/nasdaq-4h${force ? '?refresh=1' : ''}`,
        { cache: 'no-store' }
      );
      const data = await response.json();
      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || `HTTP ${response.status}`);
      }
      setPayload(data);
      setSelectedSymbol((current) =>
        data.items?.some((item) => item.symbol === current)
          ? current
          : data.items?.[0]?.symbol || ''
      );
    } catch (loadError) {
      setError(loadError?.message || 'Tarama yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(false);
    const timer = window.setInterval(() => load(false), 5 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [load]);

  const visibleItems = useMemo(() => {
    const threshold = Number(minimumScore);
    return (payload?.items || []).filter((item) => item.score >= threshold);
  }, [payload, minimumScore]);

  const selected = useMemo(
    () =>
      visibleItems.find((item) => item.symbol === selectedSymbol) ||
      visibleItems[0] ||
      null,
    [selectedSymbol, visibleItems]
  );

  return (
    <section className="nasdaqRadar">
      <style jsx>{`
        .nasdaqRadar {
          width: 100%;
          max-width: 1600px;
          margin: 0 auto 28px;
          color: #f8fafc;
        }

        .hero,
        .summaryCard,
        .tableCard,
        .detail,
        .metric,
        .conditionBox {
          border: 1px solid rgba(56, 189, 248, 0.22);
          background: #111821;
          box-sizing: border-box;
        }

        .hero {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
          padding: 20px;
          border-radius: 17px;
          margin-bottom: 14px;
          background:
            radial-gradient(circle at top left, rgba(56,189,248,.12), transparent 38%),
            #101720;
        }

        h2, h3, p { margin: 0; }
        h2 { font-size: 28px; }
        h3 { font-size: 20px; }

        .subtitle,
        .muted {
          color: #94a3b8;
        }

        .subtitle {
          margin-top: 6px;
          font-size: 14px;
        }

        .actions {
          display: flex;
          align-items: center;
          gap: 9px;
          flex-wrap: wrap;
        }

        button,
        select {
          min-height: 40px;
          padding: 0 12px;
          border: 1px solid rgba(56, 189, 248, 0.3);
          border-radius: 9px;
          color: #e2e8f0;
          background: #111827;
          font: inherit;
          font-weight: 850;
        }

        button { cursor: pointer; }
        button:disabled { opacity: .55; cursor: default; }

        .summaries {
          display: grid;
          grid-template-columns: repeat(5, minmax(145px, 1fr));
          gap: 10px;
          margin-bottom: 14px;
        }

        .summaryCard {
          min-height: 92px;
          padding: 14px;
          border-radius: 13px;
        }

        .summaryCard span,
        .metric span {
          display: block;
          margin-bottom: 7px;
          color: #94a3b8;
          font-size: 12px;
        }

        .summaryCard strong { font-size: 22px; }
        .error {
          margin-bottom: 14px;
          padding: 14px;
          border: 1px solid rgba(239,68,68,.35);
          border-radius: 12px;
          color: #fca5a5;
          background: rgba(127,29,29,.18);
        }

        .tableCard {
          border-radius: 14px;
          overflow: hidden;
          margin-bottom: 14px;
        }

        .tableScroll { overflow-x: auto; }
        table {
          width: 100%;
          min-width: 1120px;
          border-collapse: collapse;
        }

        th,
        td {
          padding: 10px 11px;
          border-bottom: 1px solid rgba(148,163,184,.12);
          text-align: left;
          white-space: nowrap;
          font-size: 12px;
        }

        th {
          color: #94a3b8;
          background: #0f172a;
          font-size: 11px;
        }

        tbody tr { cursor: pointer; }
        tbody tr:hover,
        tbody tr.selected { background: rgba(56,189,248,.075); }
        tbody tr:last-child td { border-bottom: 0; }

        .symbol { font-size: 14px; color: #f8fafc; }
        .badge {
          display: inline-flex;
          padding: 4px 7px;
          border: 1px solid currentColor;
          border-radius: 6px;
          font-size: 10px;
          font-weight: 900;
        }

        .detail {
          padding: 18px;
          border-radius: 15px;
        }

        .detailTop {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
          margin-bottom: 14px;
        }

        .metrics {
          display: grid;
          grid-template-columns: repeat(6, minmax(125px, 1fr));
          gap: 9px;
          margin-bottom: 13px;
        }

        .metric {
          padding: 13px;
          border-radius: 11px;
        }

        .metric strong { font-size: 17px; }
        .conditions {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }

        .conditionBox {
          padding: 15px;
          border-radius: 12px;
        }

        .conditionBox h3 { margin-bottom: 9px; }
        .conditionBox ul { margin: 0; padding-left: 20px; }
        .conditionBox li {
          margin: 6px 0;
          color: #cbd5e1;
          font-size: 13px;
        }

        .footnote {
          margin-top: 12px;
          color: #64748b;
          font-size: 12px;
        }

        @media (max-width: 900px) {
          .summaries { grid-template-columns: repeat(2, 1fr); }
          .metrics { grid-template-columns: repeat(2, 1fr); }
          .conditions { grid-template-columns: 1fr; }
        }

        @media (max-width: 600px) {
          .hero { padding: 15px; }
          h2 { font-size: 24px; }
          .summaries { grid-template-columns: repeat(2, 1fr); }
          .summaryCard { min-height: 82px; padding: 12px; }
          .summaryCard strong { font-size: 19px; }
          .detail { padding: 13px; }
          th, td { padding: 9px; font-size: 12px; }
        }
      `}</style>

      <div className="hero">
        <div>
          <h2>◫ NASDAQ 4H Radar</h2>
          <p className="subtitle">
            $3+ likit hisseler • kapanmış 4 saatlik mumlar • emir göndermez
          </p>
        </div>

        <div className="actions">
          <select
            value={minimumScore}
            onChange={(event) => setMinimumScore(event.target.value)}
            aria-label="En düşük sinyal puanı"
          >
            {FILTERS.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>

          <button type="button" disabled={loading} onClick={() => load(true)}>
            {loading ? 'Taranıyor…' : '↻ Yenile'}
          </button>
        </div>
      </div>

      {error ? <div className="error">{error}</div> : null}

      <div className="summaries">
        <div className="summaryCard">
          <span>Taranan likit hisse</span>
          <strong>{payload?.scanned ?? '—'}</strong>
        </div>
        <div className="summaryCard">
          <span>İşlem sinyali</span>
          <strong style={{ color: '#22c55e' }}>{payload?.counts?.signals ?? '—'}</strong>
        </div>
        <div className="summaryCard">
          <span>Onay bekleyen</span>
          <strong style={{ color: '#facc15' }}>{payload?.counts?.waiting ?? '—'}</strong>
        </div>
        <div className="summaryCard">
          <span>QQQ piyasa yönü</span>
          <strong style={{ color: payload?.marketPositive ? '#22c55e' : '#ef4444' }}>
            {payload ? (payload.marketPositive ? 'OLUMLU' : 'OLUMSUZ') : '—'}
          </strong>
        </div>
        <div className="summaryCard">
          <span>Son tarama</span>
          <strong style={{ fontSize: 15 }}>{dateTime(payload?.generatedAt)}</strong>
        </div>
      </div>

      <div className="tableCard">
        <div className="tableScroll">
          <table>
            <thead>
              <tr>
                <th>Hisse</th>
                <th>Durum</th>
                <th>Puan</th>
                <th>Fiyat</th>
                <th>% Günlük</th>
                <th>RSI</th>
                <th>4H hacim</th>
                <th>EMA9 / EMA20</th>
                <th>Stop</th>
                <th>Hedef 1</th>
                <th>Veri zamanı</th>
              </tr>
            </thead>
            <tbody>
              {visibleItems.length ? visibleItems.map((item) => (
                <tr
                  key={item.symbol}
                  className={selected?.symbol === item.symbol ? 'selected' : ''}
                  onClick={() => setSelectedSymbol(item.symbol)}
                >
                  <td><strong className="symbol">{item.symbol}</strong></td>
                  <td>
                    <span className="badge" style={{ color: setupColor(item.setup) }}>
                      {item.setup}
                    </span>
                  </td>
                  <td><strong>{item.score}</strong></td>
                  <td>{money(item.price)}</td>
                  <td style={{ color: item.changePercent >= 0 ? '#22c55e' : '#ef4444' }}>
                    {percent(item.changePercent)}
                  </td>
                  <td>{number(item.rsi)}</td>
                  <td>{number(item.volumeRatio, 'x')}</td>
                  <td>{money(item.ema9)} / {money(item.ema20)}</td>
                  <td style={{ color: '#f87171' }}>{money(item.stop)}</td>
                  <td style={{ color: '#4ade80' }}>{money(item.target1)}</td>
                  <td>{dateTime(item.dataTime)}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan="11">
                    {loading ? 'NASDAQ hisseleri taranıyor…' : 'Seçilen puanda hisse bulunamadı.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selected ? (
        <div className="detail">
          <div className="detailTop">
            <div>
              <h3>{selected.symbol} • 4 saatlik işlem planı</h3>
              <p className="muted">
                Son karar yalnızca kapanmış 4 saatlik mumla üretilmiştir.
              </p>
            </div>
            <span className="badge" style={{ color: setupColor(selected.setup) }}>
              {selected.setup} • {selected.score}/100
            </span>
          </div>

          <div className="metrics">
            <div className="metric"><span>Giriş</span><strong>{money(selected.entry)}</strong></div>
            <div className="metric"><span>Stop</span><strong style={{ color: '#f87171' }}>{money(selected.stop)}</strong></div>
            <div className="metric"><span>Hedef 1</span><strong style={{ color: '#4ade80' }}>{money(selected.target1)}</strong></div>
            <div className="metric"><span>Hedef 2</span><strong style={{ color: '#22c55e' }}>{money(selected.target2)}</strong></div>
            <div className="metric"><span>Risk mesafesi</span><strong>{percent(selected.riskPercent)}</strong></div>
            <div className="metric"><span>20 günlük direnç</span><strong>{money(selected.resistance)}</strong></div>
          </div>

          <div className="conditions">
            <div className="conditionBox">
              <h3 style={{ color: '#4ade80' }}>Kararı destekleyenler</h3>
              <ul>
                {selected.reasons?.length
                  ? selected.reasons.map((reason) => <li key={reason}>✓ {reason}</li>)
                  : <li>Henüz destekleyici koşul yok.</li>}
              </ul>
            </div>
            <div className="conditionBox">
              <h3 style={{ color: '#fca5a5' }}>Eksik koşullar</h3>
              <ul>
                {selected.missing?.length
                  ? selected.missing.map((reason) => <li key={reason}>× {reason}</li>)
                  : <li>Eksik koşul yok.</li>}
              </ul>
            </div>
          </div>
        </div>
      ) : null}

      <p className="footnote">
        Bu radar yatırım tavsiyesi değildir. İlk aşamada yalnızca tarama ve takip yapar; sanal veya gerçek emir oluşturmaz.
      </p>
    </section>
  );
}
