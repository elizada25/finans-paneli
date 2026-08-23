
'use client';

import {
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
} from 'firebase/firestore';
import { firestoreDb } from '../../../lib-firebase';

function money(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) return '—';

  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(number);
}

function dateTime(value) {
  if (!value) return '—';

  return new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'Europe/Istanbul',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

function MiniChart({ rows = [] }) {
  const points = useMemo(() => {
    if (rows.length < 2) return '';

    const values = rows.map(
      (item) => Number(item.close)
    );

    const minimum = Math.min(...values);
    const maximum = Math.max(...values);
    const range = maximum - minimum || 1;

    return values
      .map((value, index) => {
        const x =
          (index / (values.length - 1)) *
          1000;

        const y =
          250 -
          ((value - minimum) / range) *
            220;

        return `${x},${y}`;
      })
      .join(' ');
  }, [rows]);

  return (
    <svg
      viewBox="0 0 1000 280"
      preserveAspectRatio="none"
      style={{
        width: '100%',
        height: 280,
        display: 'block',
        borderRadius: 12,
        background: '#070d16',
      }}
    >
      {[55, 110, 165, 220].map(
        (y) => (
          <line
            key={y}
            x1="0"
            x2="1000"
            y1={y}
            y2={y}
            stroke="rgba(148,163,184,0.12)"
          />
        )
      )}

      <polyline
        points={points}
        fill="none"
        stroke="#38bdf8"
        strokeWidth="4"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export default function BtcCenter({
  userId,
}) {
  const [analysis, setAnalysis] =
    useState(null);
  const [loading, setLoading] =
    useState(true);
  const [error, setError] =
    useState('');
  const [config, setConfig] =
    useState(null);
  const [trades, setTrades] =
    useState([]);
  const [capital, setCapital] =
    useState('10000');
  const [risk, setRisk] =
    useState('1');
  const [saving, setSaving] =
    useState(false);

  useEffect(() => {
    if (!userId) return undefined;

    const configRef = doc(
      firestoreDb,
      'users',
      userId,
      'btcRobot',
      'config'
    );

    const unsubscribeConfig =
      onSnapshot(configRef, (snapshot) => {
        if (!snapshot.exists()) {
          setConfig(null);
          return;
        }

        const value = snapshot.data();
        setConfig(value);

        if (value.startingCapital) {
          setCapital(
            String(value.startingCapital)
          );
        }

        if (value.riskPercent) {
          setRisk(
            String(value.riskPercent)
          );
        }
      });

    const tradesRef = collection(
      firestoreDb,
      'users',
      userId,
      'btcTrades'
    );

    const unsubscribeTrades =
      onSnapshot(tradesRef, (snapshot) => {
        const items = snapshot.docs
          .map((item) => ({
            id: item.id,
            ...item.data(),
          }))
          .sort((first, second) =>
            String(
              second.openedAt || ''
            ).localeCompare(
              String(first.openedAt || '')
            )
          );

        setTrades(items);
      });

    return () => {
      unsubscribeConfig();
      unsubscribeTrades();
    };
  }, [userId]);

  useEffect(() => {
    let active = true;

    async function loadAnalysis() {
      try {
        const response = await fetch(
          '/api/btc-radar',
          {
            cache: 'no-store',
          }
        );

        const payload =
          await response.json();

        if (!response.ok || !payload.ok) {
          throw new Error(
            payload.error ||
              'BTC verisi alınamadı.'
          );
        }

        if (active) {
          setAnalysis(payload);
          setError('');
        }
      } catch (loadError) {
        if (active) {
          setError(
            loadError?.message ||
              'BTC analizi yüklenemedi.'
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    loadAnalysis();

    const timer = window.setInterval(
      loadAnalysis,
      60000
    );

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  async function saveRobot(
    enabled = config?.enabled === true
  ) {
    const startingCapital =
      Number(
        String(capital).replace(',', '.')
      );

    const riskPercent =
      Number(
        String(risk).replace(',', '.')
      );

    if (
      !Number.isFinite(startingCapital) ||
      startingCapital <= 0
    ) {
      window.alert(
        'Geçerli bir sanal sermaye yazın.'
      );
      return;
    }

    if (
      !Number.isFinite(riskPercent) ||
      riskPercent < 0.25 ||
      riskPercent > 2
    ) {
      window.alert(
        'Risk oranı %0,25 ile %2 arasında olmalıdır.'
      );
      return;
    }

    setSaving(true);

    try {
      const configRef = doc(
        firestoreDb,
        'users',
        userId,
        'btcRobot',
        'config'
      );

      const payload = {
        enabled,
        startingCapital,
        riskPercent,
        updatedAt:
          new Date().toISOString(),
      };

      if (!config?.balance) {
        payload.balance =
          startingCapital;
      }

      await setDoc(
        configRef,
        payload,
        { merge: true }
      );
    } catch (saveError) {
      window.alert(
        `Robot kaydedilemedi: ${
          saveError?.message ||
          'Bilinmeyen hata'
        }`
      );
    } finally {
      setSaving(false);
    }
  }

  const openTrade = trades.find(
    (trade) => trade.status === 'open'
  );

  const closedTrades = trades.filter(
    (trade) => trade.status === 'closed'
  );

  const totalPnl = closedTrades.reduce(
    (total, trade) =>
      total + Number(trade.pnl || 0),
    0
  );

  const winners = closedTrades.filter(
    (trade) => Number(trade.pnl) > 0
  ).length;

  const successRate =
    closedTrades.length > 0
      ? (winners / closedTrades.length) *
        100
      : 0;

  const signalColor =
    analysis?.signal === 'AL'
      ? '#22c55e'
      : analysis?.signal === 'ÇIKIŞ'
        ? '#ef4444'
        : '#f59e0b';

  return (
    <section className="btcCenter">
      <style jsx>{`
        .btcCenter {
          width: 100%;
          max-width: 1600px;
          margin: 0 auto 28px;
          color: #f8fafc;
        }

        .top {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 14px;
          flex-wrap: wrap;
          margin-bottom: 14px;
        }

        .top h2 {
          margin: 0;
          font-size: 25px;
        }

        .muted {
          color: #94a3b8;
          font-size: 13px;
        }

        .cards {
          display: grid;
          grid-template-columns:
            repeat(auto-fit, minmax(170px, 1fr));
          gap: 10px;
          margin-bottom: 12px;
        }

        .card,
        .panel {
          border: 1px solid rgba(212,175,55,0.25);
          border-radius: 14px;
          background: #17130c;
        }

        .card {
          padding: 15px;
        }

        .card span {
          display: block;
          margin-bottom: 7px;
          color: #94a3b8;
          font-size: 12px;
        }

        .card strong {
          font-size: 20px;
        }

        .grid {
          display: grid;
          grid-template-columns:
            minmax(0, 1.6fr)
            minmax(290px, 0.7fr);
          gap: 12px;
        }

        .panel {
          padding: 15px;
        }

        .panel h3 {
          margin: 0 0 12px;
          font-size: 18px;
        }

        .reason {
          display: flex;
          gap: 9px;
          padding: 9px 0;
          border-bottom:
            1px solid rgba(148,163,184,0.12);
          font-size: 13px;
        }

        .robotForm {
          display: grid;
          gap: 9px;
        }

        label {
          display: grid;
          gap: 5px;
          color: #94a3b8;
          font-size: 12px;
          font-weight: 800;
        }

        input,
        button {
          min-height: 40px;
          border: 1px solid rgba(148,163,184,0.24);
          border-radius: 9px;
          color: #f8fafc;
          background: #0f172a;
          font: inherit;
        }

        input {
          padding: 0 10px;
        }

        button {
          padding: 0 12px;
          cursor: pointer;
          font-weight: 900;
        }

        .primary {
          border-color:
            rgba(212,175,55,0.55);
          color: #111827;
          background:
            linear-gradient(135deg,#d4af37,#f0d675);
        }

        .danger {
          border-color:
            rgba(239,68,68,0.5);
          color: #fecaca;
          background:
            rgba(127,29,29,0.35);
        }

        .table {
          margin-top: 12px;
          overflow-x: auto;
          border: 1px solid rgba(148,163,184,0.14);
          border-radius: 12px;
        }

        table {
          width: 100%;
          border-collapse: collapse;
          min-width: 760px;
          font-size: 12px;
        }

        th,
        td {
          padding: 10px;
          text-align: left;
          border-bottom:
            1px solid rgba(148,163,184,0.12);
        }

        th {
          color: #94a3b8;
          background: #0f172a;
        }

        @media (max-width: 850px) {
          .grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      <div className="top">
        <div>
          <h2>₿ BTC Merkezi</h2>
          <div className="muted">
            BTC/USDT • Kapanmış mumlarla teknik analiz • Sanal işlem
          </div>
        </div>

        <div
          style={{
            color:
              config?.enabled
                ? '#86efac'
                : '#fca5a5',
            fontWeight: 900,
          }}
        >
          {config?.enabled
            ? '● Sanal robot aktif'
            : '● Sanal robot kapalı'}
        </div>
      </div>

      {error ? (
        <div
          className="panel"
          style={{ color: '#fca5a5' }}
        >
          {error}
        </div>
      ) : null}

      <div className="cards">
        <div className="card">
          <span>BTC/USDT</span>
          <strong>
            {loading
              ? 'Yükleniyor…'
              : money(analysis?.price)}
          </strong>
        </div>

        <div className="card">
          <span>Robot sonucu</span>
          <strong
            style={{
              color: signalColor,
            }}
          >
            {analysis?.signal || '—'}
          </strong>
        </div>

        <div className="card">
          <span>Sinyal puanı</span>
          <strong>
            {analysis?.score ?? '—'} / 100
          </strong>
        </div>

        <div className="card">
          <span>RSI 14</span>
          <strong>
            {analysis?.rsi ?? '—'}
          </strong>
        </div>

        <div className="card">
          <span>Sanal bakiye</span>
          <strong>
            {money(
              config?.balance ||
              config?.startingCapital
            )}
          </strong>
        </div>

        <div className="card">
          <span>Toplam sanal sonuç</span>
          <strong
            style={{
              color:
                totalPnl >= 0
                  ? '#22c55e'
                  : '#ef4444',
            }}
          >
            {money(totalPnl)}
          </strong>
        </div>
      </div>

      <div className="grid">
        <div className="panel">
          <h3>BTC 1 saatlik görünüm</h3>

          <MiniChart
            rows={analysis?.chart || []}
          />

          <div
            className="cards"
            style={{ marginTop: 12 }}
          >
            <div className="card">
              <span>EMA22</span>
              <strong>
                {money(analysis?.ema22)}
              </strong>
            </div>

            <div className="card">
              <span>EMA50</span>
              <strong>
                {money(analysis?.ema50)}
              </strong>
            </div>

            <div className="card">
              <span>EMA200</span>
              <strong>
                {money(analysis?.ema200)}
              </strong>
            </div>

            <div className="card">
              <span>Hacim oranı</span>
              <strong>
                {analysis?.volumeRatio
                  ? `${analysis.volumeRatio}x`
                  : '—'}
              </strong>
            </div>
          </div>

          <h3>İşlem planı</h3>

          <div className="cards">
            <div className="card">
              <span>Giriş</span>
              <strong>
                {money(analysis?.price)}
              </strong>
            </div>

            <div className="card">
              <span>Stop</span>
              <strong
                style={{ color: '#f87171' }}
              >
                {money(analysis?.stop)}
              </strong>
            </div>

            <div className="card">
              <span>Hedef 1</span>
              <strong
                style={{ color: '#4ade80' }}
              >
                {money(analysis?.target1)}
              </strong>
            </div>

            <div className="card">
              <span>Hedef 2</span>
              <strong
                style={{ color: '#22c55e' }}
              >
                {money(analysis?.target2)}
              </strong>
            </div>
          </div>

          <h3>Kararın gerekçeleri</h3>

          {analysis?.reasons?.map(
            (reason) => (
              <div
                key={reason.label}
                className="reason"
              >
                <b
                  style={{
                    color:
                      reason.positive
                        ? '#4ade80'
                        : '#f87171',
                  }}
                >
                  {reason.positive
                    ? '✓'
                    : '×'}
                </b>

                <div>
                  <strong>
                    {reason.label}
                  </strong>
                  <div className="muted">
                    {reason.text}
                  </div>
                </div>
              </div>
            )
          )}
        </div>

        <div className="panel">
          <h3>Sanal robot ayarları</h3>

          <div className="robotForm">
            <label>
              Sanal başlangıç sermayesi (USDT)
              <input
                value={capital}
                onChange={(event) =>
                  setCapital(
                    event.target.value
                  )
                }
                inputMode="decimal"
              />
            </label>

            <label>
              İşlem başına risk (%0,25–%2)
              <input
                value={risk}
                onChange={(event) =>
                  setRisk(
                    event.target.value
                  )
                }
                inputMode="decimal"
              />
            </label>

            <button
              type="button"
              onClick={() =>
                saveRobot(
                  config?.enabled === true
                )
              }
              disabled={saving}
            >
              Ayarları kaydet
            </button>

            <button
              type="button"
              className={
                config?.enabled
                  ? 'danger'
                  : 'primary'
              }
              onClick={() =>
                saveRobot(
                  config?.enabled !== true
                )
              }
              disabled={saving}
            >
              {config?.enabled
                ? 'Robotu durdur'
                : 'Sanal robotu başlat'}
            </button>
          </div>

          <hr
            style={{
              margin: '16px 0',
              borderColor:
                'rgba(148,163,184,0.15)',
            }}
          />

          <h3>Açık işlem</h3>

          {openTrade ? (
            <div className="card">
              <span>
                Açılış: {dateTime(
                  openTrade.openedAt
                )}
              </span>
              <strong>
                Giriş {money(openTrade.entry)}
              </strong>
              <div className="muted">
                Stop {money(openTrade.stop)}
                {' • '}
                Hedef {money(openTrade.target2)}
              </div>
            </div>
          ) : (
            <div className="muted">
              Açık sanal işlem yok.
            </div>
          )}

          <hr
            style={{
              margin: '16px 0',
              borderColor:
                'rgba(148,163,184,0.15)',
            }}
          />

          <h3>Performans</h3>

          <div className="reason">
            <span>Kapanan işlem</span>
            <strong>
              {closedTrades.length}
            </strong>
          </div>

          <div className="reason">
            <span>Başarı oranı</span>
            <strong>
              %{successRate.toFixed(1)}
            </strong>
          </div>

          <div className="reason">
            <span>Net sonuç</span>
            <strong>
              {money(totalPnl)}
            </strong>
          </div>
        </div>
      </div>

      <div className="table">
        <table>
          <thead>
            <tr>
              <th>Durum</th>
              <th>Açılış</th>
              <th>Giriş</th>
              <th>Çıkış</th>
              <th>Stop</th>
              <th>Hedef</th>
              <th>Sonuç</th>
            </tr>
          </thead>

          <tbody>
            {trades.length ? (
              trades.slice(0, 30).map(
                (trade) => (
                  <tr key={trade.id}>
                    <td>
                      {trade.status === 'open'
                        ? 'AÇIK'
                        : 'KAPANDI'}
                    </td>
                    <td>
                      {dateTime(
                        trade.openedAt
                      )}
                    </td>
                    <td>
                      {money(trade.entry)}
                    </td>
                    <td>
                      {money(trade.exit)}
                    </td>
                    <td>
                      {money(trade.stop)}
                    </td>
                    <td>
                      {money(trade.target2)}
                    </td>
                    <td
                      style={{
                        color:
                          Number(trade.pnl) >= 0
                            ? '#22c55e'
                            : '#ef4444',
                      }}
                    >
                      {money(trade.pnl)}
                    </td>
                  </tr>
                )
              )
            ) : (
              <tr>
                <td colSpan="7">
                  Henüz sanal işlem yok.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="muted">
        Bu ekran yatırım tavsiyesi değildir.
        İlk aşamada yalnızca sanal işlem yapar.
      </p>
    </section>
  );
}
