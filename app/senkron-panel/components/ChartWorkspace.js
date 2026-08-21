'use client';

import {
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  CandlestickSeries,
  ColorType,
  createChart,
} from 'lightweight-charts';
import {
  doc,
  getDoc,
  setDoc,
} from 'firebase/firestore';
import { firestoreDb } from '../../../lib-firebase';

const DEFAULT_CHARTS = [
  {
    market: 'bist',
    symbol: 'GARAN',
    interval: '1d',
  },
  {
    market: 'bist',
    symbol: 'THYAO',
    interval: '1d',
  },
  {
    market: 'bist',
    symbol: 'AKBNK',
    interval: '1d',
  },
  {
    market: 'us',
    symbol: 'NVDA',
    interval: '1d',
  },
];

function ChartTile({
  config,
  index,
  fullscreen,
  onFullscreen,
  onChange,
}) {
  const hostRef = useRef(null);
  const [draft, setDraft] =
    useState(config.symbol);
  const [loading, setLoading] =
    useState(false);
  const [error, setError] =
    useState('');

  useEffect(() => {
    setDraft(config.symbol);
  }, [config.symbol]);

  useEffect(() => {
    const host = hostRef.current;

    if (!host) return undefined;

    let active = true;
    const controller =
      new AbortController();

    const chart = createChart(host, {
      width: host.clientWidth,
      height: host.clientHeight,
      layout: {
        background: {
          type: ColorType.Solid,
          color: '#070d16',
        },
        textColor: '#94a3b8',
      },
      grid: {
        vertLines: {
          color:
            'rgba(148,163,184,0.08)',
        },
        horzLines: {
          color:
            'rgba(148,163,184,0.08)',
        },
      },
      rightPriceScale: {
        borderColor:
          'rgba(148,163,184,0.18)',
      },
      timeScale: {
        borderColor:
          'rgba(148,163,184,0.18)',
        timeVisible:
          config.interval !== '1d',
        secondsVisible: false,
        rightOffset: 4,
      },
      localization: {
        locale: 'tr-TR',
      },
    });

    const candles = chart.addSeries(
      CandlestickSeries,
      {
        upColor: '#14b8a6',
        downColor: '#ef4444',
        borderVisible: false,
        wickUpColor: '#2dd4bf',
        wickDownColor: '#f87171',
      }
    );

    const observer =
      new ResizeObserver(() => {
        if (!host.clientWidth ||
            !host.clientHeight) {
          return;
        }

        chart.applyOptions({
          width: host.clientWidth,
          height: host.clientHeight,
        });
      });

    observer.observe(host);

    async function loadChart() {
      setLoading(true);
      setError('');

      try {
        const query =
          new URLSearchParams({
            market: config.market,
            symbol: config.symbol,
            interval: config.interval,
          });

        const response = await fetch(
          `/api/chart-workspace?${query}`,
          {
            cache: 'no-store',
            signal: controller.signal,
          }
        );

        const data = await response.json();

        if (!response.ok || !data.ok) {
          throw new Error(
            data?.error ||
            'Grafik yüklenemedi.'
          );
        }

        if (!active) return;

        candles.setData(data.rows || []);
        chart.timeScale().fitContent();
      } catch (loadError) {
        if (
          loadError?.name !==
          'AbortError'
        ) {
          setError(
            loadError?.message ||
            'Grafik yüklenemedi.'
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    loadChart();

    return () => {
      active = false;
      controller.abort();
      observer.disconnect();
      chart.remove();
    };
  }, [
    config.market,
    config.symbol,
    config.interval,
    fullscreen,
  ]);

  function applySymbol() {
    const clean = String(draft)
      .trim()
      .toUpperCase();

    if (!/^[A-Z0-9.-]{1,15}$/.test(clean)) {
      window.alert(
        'Geçerli bir sembol yazın.'
      );
      return;
    }

    onChange(index, {
      symbol: clean,
    });
  }

  return (
    <article
      className={
        fullscreen
          ? 'chartTile fullscreen'
          : 'chartTile'
      }
    >
      {/* SKY-CHART-TILE-DIRECT-FIX */}
      <style jsx>{`
        .chartTile {
          width: 100%;
          min-width: 0;
          height: 390px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          border: 1px solid
            rgba(56,189,248,0.28);
          border-radius: 12px;
          background: #070d16;
          box-sizing: border-box;
        }

        .chartTile.fullscreen {
          position: fixed;
          inset: 0;
          z-index: 999999;
          width: 100vw;
          height: 100vh;
          border: 0;
          border-radius: 0;
          background: #070d16;
        }

        .tileToolbar {
          flex: 0 0 auto;
          display: flex;
          align-items: center;
          gap: 5px;
          padding: 7px;
          border-bottom: 1px solid
            rgba(148,163,184,0.16);
          background:
            rgba(15,23,42,0.98);
        }

        input,
        select,
        button {
          min-width: 0;
          height: 29px;
          padding: 0 7px;
          border: 1px solid
            rgba(148,163,184,0.25);
          border-radius: 6px;
          color: #e2e8f0;
          background: #111827;
          font-family: inherit;
          font-size: 10px;
          font-weight: 800;
        }

        input {
          width: 85px;
          text-transform: uppercase;
        }

        button {
          cursor: pointer;
        }

        .chartInfo {
          flex: 0 0 25px;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 0 8px;
          color: #64748b;
          font-size: 10px;
        }

        .chartInfo strong {
          color: #7dd3fc;
        }

        .error {
          color: #fca5a5;
        }

        .chartHost {
          width: 100%;
          flex: 1 1 auto;
          min-height: 300px;
          position: relative;
        }

        .fullscreen .chartHost {
          flex: 1 1 auto;
          min-height: 0;
        }

        @media (max-width: 850px) {
          .chartTile {
            height: 360px;
          }

          .tileToolbar {
            flex-wrap: wrap;
          }
        }
      `}</style>

      <div className="tileToolbar">
        <select
          value={config.market}
          onChange={(event) =>
            onChange(index, {
              market: event.target.value,
            })
          }
        >
          <option value="bist">
            BIST
          </option>
          <option value="us">
            NASDAQ
          </option>
        </select>

        <input
          value={draft}
          onChange={(event) =>
            setDraft(event.target.value)
          }
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              applySymbol();
            }
          }}
          aria-label="Grafik sembolü"
        />

        <button
          type="button"
          onClick={applySymbol}
        >
          Aç
        </button>

        <select
          value={config.interval}
          onChange={(event) =>
            onChange(index, {
              interval:
                event.target.value,
            })
          }
        >
          <option value="5m">
            5 dk
          </option>
          <option value="15m">
            15 dk
          </option>
          <option value="60m">
            1 saat
          </option>
          <option value="1d">
            Günlük
          </option>
        </select>

        <button
          type="button"
          onClick={() =>
            onFullscreen(index)
          }
        >
          {fullscreen
            ? '✕ Küçült'
            : '⛶ Tam ekran'}
        </button>
      </div>

      <div className="chartInfo">
        <strong>
          {config.market === 'bist'
            ? 'BIST'
            : 'NASDAQ'}
          :{config.symbol}
        </strong>

        {loading ? (
          <span>Yükleniyor…</span>
        ) : null}

        {error ? (
          <span className="error">
            {error}
          </span>
        ) : null}
      </div>

      <div
        ref={hostRef}
        className="chartHost"
      />
    </article>
  );
}

export default function ChartWorkspace({
  userId,
}) {
  const [charts, setCharts] =
    useState(DEFAULT_CHARTS);
  const [ready, setReady] =
    useState(false);
  const [fullscreenIndex, setFullscreenIndex] =
    useState(null);
  const [saveStatus, setSaveStatus] =
    useState('Ayarlar yükleniyor…');

  useEffect(() => {
    let active = true;

    async function loadSettings() {
      try {
        const reference = doc(
          firestoreDb,
          'users',
          userId,
          'settings',
          'chart-workspace'
        );

        const snapshot =
          await getDoc(reference);

        const saved =
          snapshot.exists()
            ? snapshot.data()
            : {};

        if (
          active &&
          Array.isArray(saved.charts) &&
          saved.charts.length === 4
        ) {
          setCharts(saved.charts);
        }
      } catch (error) {
        console.error(
          'Grafik ayarları okunamadı:',
          error
        );
      } finally {
        if (active) {
          setReady(true);
          setSaveStatus(
            'Düzen Firebase ile eşitlendi'
          );
        }
      }
    }

    if (userId) loadSettings();

    return () => {
      active = false;
    };
  }, [userId]);

  useEffect(() => {
    if (!ready || !userId) return undefined;

    const timer = window.setTimeout(
      async () => {
        try {
          setSaveStatus(
            'Düzen kaydediliyor…'
          );

          await setDoc(
            doc(
              firestoreDb,
              'users',
              userId,
              'settings',
              'chart-workspace'
            ),
            {
              charts,
              updatedAt:
                new Date().toISOString(),
            },
            { merge: true }
          );

          setSaveStatus(
            'Düzen Firebase ile eşitlendi'
          );
        } catch (error) {
          console.error(
            'Grafik düzeni kaydedilemedi:',
            error
          );

          setSaveStatus(
            'Düzen kaydedilemedi'
          );
        }
      },
      500
    );

    return () =>
      window.clearTimeout(timer);
  }, [charts, ready, userId]);

  useEffect(() => {
    if (fullscreenIndex === null) {
      return undefined;
    }

    const previous =
      document.body.style.overflow;

    document.body.style.overflow =
      'hidden';

    function close(event) {
      if (event.key === 'Escape') {
        setFullscreenIndex(null);
      }
    }

    window.addEventListener(
      'keydown',
      close
    );

    return () => {
      document.body.style.overflow =
        previous;

      window.removeEventListener(
        'keydown',
        close
      );
    };
  }, [fullscreenIndex]);

  function updateChart(index, patch) {
    setCharts((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              ...patch,
            }
          : item
      )
    );
  }

  return (
    <section className="workspace">
      <style jsx>{`
        .workspace {
          width: 100%;
          max-width: 1600px;
          margin: 0 0 28px;
        }

        .workspaceHeader {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 10px;
        }

        h2 {
          margin: 0;
          color: #f8fafc;
          font-size: 18px;
        }

        .saveStatus {
          color: #86efac;
          font-size: 10px;
        }

        .chartGrid {
          display: grid;
          grid-template-columns:
            repeat(2, minmax(0, 1fr));
          gap: 10px;
        }

        .chartTile {
          min-width: 0;
          height: 390px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          border: 1px solid
            rgba(56,189,248,0.22);
          border-radius: 11px;
          background: #070d16;
        }

        .chartTile.fullscreen {
          position: fixed;
          inset: 0;
          z-index: 999999;
          width: 100vw;
          height: 100vh;
          border: 0;
          border-radius: 0;
        }

        .tileToolbar {
          display: flex;
          align-items: center;
          gap: 5px;
          padding: 7px;
          border-bottom: 1px solid
            rgba(148,163,184,0.15);
          background:
            rgba(15,23,42,0.96);
        }

        input,
        select,
        button {
          min-width: 0;
          height: 29px;
          padding: 0 7px;
          border: 1px solid
            rgba(148,163,184,0.22);
          border-radius: 6px;
          color: #e2e8f0;
          background: #111827;
          font-family: inherit;
          font-size: 9px;
          font-weight: 800;
        }

        input {
          width: 80px;
          text-transform: uppercase;
        }

        button {
          cursor: pointer;
        }

        .chartInfo {
          min-height: 24px;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 0 8px;
          color: #64748b;
          font-size: 9px;
        }

        .chartInfo strong {
          color: #7dd3fc;
        }

        .error {
          color: #fca5a5;
        }

        .chartHost {
          width: 100%;
          flex: 1 1 auto;
          min-height: 0;
        }

        .chartTile.fullscreen .chartHost {
          flex: 1 1 auto;
          min-height: 0;
        }

        @media (max-width: 850px) {
          .chartGrid {
            grid-template-columns: 1fr;
          }

          .chartTile {
            height: 360px;
          }

          .tileToolbar {
            flex-wrap: wrap;
          }
        }
      `}</style>

      <div className="workspaceHeader">
        <div>
          <h2>Çoklu Grafik Ekranı</h2>
          <span className="saveStatus">
            ● {saveStatus}
          </span>
        </div>
      </div>

      <div className="chartGrid">
        {charts.map((config, index) => (
          <ChartTile
            key={index}
            config={config}
            index={index}
            fullscreen={
              fullscreenIndex === index
            }
            onFullscreen={(selectedIndex) =>
              setFullscreenIndex(
                fullscreenIndex === selectedIndex
                  ? null
                  : selectedIndex
              )
            }
            onChange={updateChart}
          />
        ))}
      </div>

      <p
        style={{
          margin: '8px 0 0',
          color: '#64748b',
          fontSize: '9px',
        }}
      >
        Grafik çizimi:{' '}
        <a
          href="https://www.tradingview.com/"
          target="_blank"
          rel="noreferrer"
          style={{ color: '#7dd3fc' }}
        >
          TradingView Lightweight Charts
        </a>
        {' '}• Widget kullanılmaz.
      </p>
    </section>
  );
}
