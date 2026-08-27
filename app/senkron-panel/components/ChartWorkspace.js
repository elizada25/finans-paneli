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
  LineSeries,
} from 'lightweight-charts';
import {
  doc,
  getDoc,
  setDoc,
} from 'firebase/firestore';
import { firestoreDb } from '../../../lib-firebase';

const INDICATORS = [
  ['ema5', 'EMA5', 'ema', 5, '#facc15'],
  ['ema22', 'EMA22', 'ema', 22, '#00e5ff'],
  ['ema50', 'EMA50', 'ema', 50, '#ff8a00'],
  ['ema100', 'EMA100', 'ema', 100, '#ff3b30'],
  ['ema200', 'EMA200', 'ema', 200, '#a855f7'],
  ['sma50', 'SMA50', 'sma', 50, '#22c55e'],
  ['sma100', 'SMA100', 'sma', 100, '#f8fafc'],
  ['sma200', 'SMA200', 'sma', 200, '#ff4fd8'],
];

const DEFAULT_CHARTS = [
  {
    id: 'chart-garan',
    market: 'bist',
    symbol: 'GARAN',
    interval: '1d',
    indicators: [],
    drawings: [],
  },
  {
    id: 'chart-thyao',
    market: 'bist',
    symbol: 'THYAO',
    interval: '1d',
    indicators: [],
    drawings: [],
  },
  {
    id: 'chart-akbnk',
    market: 'bist',
    symbol: 'AKBNK',
    interval: '1d',
    indicators: [],
    drawings: [],
  },
  {
    id: 'chart-nvda',
    market: 'us',
    symbol: 'NVDA',
    interval: '1d',
    indicators: [],
    drawings: [],
  },
];

function normalizeChart(item, index) {
  return {
    id:
      item?.id ||
      `chart-saved-${index}`,
    market:
      item?.market === 'us'
        ? 'us'
        : 'bist',
    symbol:
      String(item?.symbol || 'GARAN')
        .trim()
        .toUpperCase(),
    interval:
      ['5m', '15m', '60m', '1d']
        .includes(item?.interval)
        ? item.interval
        : '1d',
    indicators:
      Array.isArray(item?.indicators)
        ? item.indicators.filter((key) =>
            INDICATORS.some(
              ([indicatorKey]) =>
                indicatorKey === key
            )
          )
        : [],
    drawings:
      Array.isArray(item?.drawings)
        ? item.drawings
        : [],
  };
}

function calculateEma(rows, period) {
  if (rows.length < period) return [];

  const multiplier =
    2 / (period + 1);

  let current =
    rows
      .slice(0, period)
      .reduce(
        (total, row) =>
          total + row.close,
        0
      ) / period;

  const output = [
    {
      time: rows[period - 1].time,
      value: current,
    },
  ];

  for (
    let index = period;
    index < rows.length;
    index += 1
  ) {
    current =
      rows[index].close * multiplier +
      current * (1 - multiplier);

    output.push({
      time: rows[index].time,
      value: current,
    });
  }

  return output;
}

function calculateSma(rows, period) {
  if (rows.length < period) return [];

  const output = [];
  let total = 0;

  rows.forEach((row, index) => {
    total += row.close;

    if (index >= period) {
      total -=
        rows[index - period].close;
    }

    if (index >= period - 1) {
      output.push({
        time: row.time,
        value: total / period,
      });
    }
  });

  return output;
}

function ChartTile({
  config,
  fullscreen,
  onFullscreen,
  onChange,
  onRemove,
}) {
  const hostRef = useRef(null);
  const chartApiRef = useRef(null);
  const candleSeriesRef = useRef(null);
  const drawingModeRef = useRef(false);

  const [draft, setDraft] =
    useState(config.symbol);
  const [loading, setLoading] =
    useState(false);
  const [error, setError] =
    useState('');
  const [drawingMode, setDrawingMode] =
    useState(false);
  const [drawStatus, setDrawStatus] =
    useState('');
  const [anchorData, setAnchorData] =
    useState(null);
  const [anchorPixel, setAnchorPixel] =
    useState(null);
  const [previewPixel, setPreviewPixel] =
    useState(null);
  const [
    savedDrawingPixels,
    setSavedDrawingPixels,
  ] = useState([]);

  drawingModeRef.current = drawingMode;

  useEffect(() => {
    setDraft(config.symbol);
    setAnchorData(null);
    setAnchorPixel(null);
    setPreviewPixel(null);
  }, [config.symbol]);

  useEffect(() => {
    if (drawingMode) {
      setDrawStatus(
        'Grafikte ilk noktayı seçin'
      );
    } else {
      setAnchorData(null);
      setAnchorPixel(null);
      setPreviewPixel(null);
    }
  }, [drawingMode]);

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

    chartApiRef.current = chart;
    candleSeriesRef.current = candles;

    let projectionFrame = null;

    function projectDrawings() {
      if (!active) return;

      const projected = (
        config.drawings || []
      )
        .map((drawing) => {
          const time1 = Number(
            drawing.time1
          );
          const price1 = Number(
            drawing.price1
          );
          const time2 = Number(
            drawing.time2
          );
          const price2 = Number(
            drawing.price2
          );

          if (
            !Number.isFinite(time1) ||
            !Number.isFinite(price1) ||
            !Number.isFinite(time2) ||
            !Number.isFinite(price2)
          ) {
            return null;
          }

          const x1 = chart
            .timeScale()
            .timeToCoordinate(time1);
          const y1 =
            candles.priceToCoordinate(
              price1
            );
          const x2 = chart
            .timeScale()
            .timeToCoordinate(time2);
          const y2 =
            candles.priceToCoordinate(
              price2
            );

          if (
            !Number.isFinite(x1) ||
            !Number.isFinite(y1) ||
            !Number.isFinite(x2) ||
            !Number.isFinite(y2)
          ) {
            return null;
          }

          return {
            id:
              drawing.id ||
              `${time1}-${time2}`,
            x1,
            y1,
            x2,
            y2,
          };
        })
        .filter(Boolean);

      setSavedDrawingPixels(projected);
    }

    function requestProjection() {
      if (projectionFrame !== null) {
        window.cancelAnimationFrame(
          projectionFrame
        );
      }

      projectionFrame =
        window.requestAnimationFrame(() => {
          projectionFrame = null;
          projectDrawings();
        });
    }

    setSavedDrawingPixels([]);

    chart
      .timeScale()
      .subscribeVisibleLogicalRangeChange(
        requestProjection
      );

    host.addEventListener(
      'wheel',
      requestProjection,
      { passive: true }
    );
    host.addEventListener(
      'pointermove',
      requestProjection,
      { passive: true }
    );

    const observer =
      new ResizeObserver(() => {
        if (
          !host.clientWidth ||
          !host.clientHeight
        ) {
          return;
        }

        chart.applyOptions({
          width: host.clientWidth,
          height: host.clientHeight,
        });

        requestProjection();
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

        const rows = data.rows || [];

        candles.setData(
          rows.map((row) => ({
            time: row.time,
            open: row.open,
            high: row.high,
            low: row.low,
            close: row.close,
          }))
        );

        for (
          const [
            key,
            title,
            type,
            period,
            color,
          ] of INDICATORS
        ) {
          if (
            !config.indicators?.includes(key)
          ) {
            continue;
          }

          const indicatorSeries =
            chart.addSeries(
              LineSeries,
              {
                color,
                lineWidth:
                  period >= 200 ? 3 : 2,
                title,
                priceLineVisible: false,
                lastValueVisible: true,
                crosshairMarkerVisible: false,
              }
            );

          indicatorSeries.setData(
            type === 'ema'
              ? calculateEma(
                  rows,
                  period
                )
              : calculateSma(
                  rows,
                  period
                )
          );
        }

        chart.timeScale().fitContent();
        requestProjection();
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

      chart
        .timeScale()
        .unsubscribeVisibleLogicalRangeChange(
          requestProjection
        );

      host.removeEventListener(
        'wheel',
        requestProjection
      );
      host.removeEventListener(
        'pointermove',
        requestProjection
      );

      if (projectionFrame !== null) {
        window.cancelAnimationFrame(
          projectionFrame
        );
      }

      chartApiRef.current = null;
      candleSeriesRef.current = null;
      chart.remove();
    };
  }, [
    config.id,
    config.market,
    config.symbol,
    config.interval,
    config.indicators,
    config.drawings,
    fullscreen,
  ]);

  function getDrawingPoint(event) {
    const chart = chartApiRef.current;
    const candles =
      candleSeriesRef.current;

    if (!chart || !candles) {
      return null;
    }

    const bounds =
      event.currentTarget
        .getBoundingClientRect();

    const x =
      event.clientX - bounds.left;

    const y =
      event.clientY - bounds.top;

    const time =
      chart.timeScale()
        .coordinateToTime(x);

    const price =
      candles.coordinateToPrice(y);

    const numericTime = Number(time);
    const numericPrice = Number(price);

    if (
      !Number.isFinite(numericTime) ||
      !Number.isFinite(numericPrice)
    ) {
      return null;
    }

    return {
      data: {
        time: numericTime,
        value: numericPrice,
      },
      pixel: {
        x,
        y,
      },
    };
  }

  function handleDrawPointerDown(event) {
    event.preventDefault();
    event.stopPropagation();

    if (!drawingModeRef.current) {
      return;
    }

    const point =
      getDrawingPoint(event);

    if (!point) {
      setDrawStatus(
        'Mumların bulunduğu alan içinde bir nokta seçin'
      );
      return;
    }

    if (!anchorData) {
      setAnchorData(point.data);
      setAnchorPixel(point.pixel);
      setPreviewPixel(point.pixel);

      setDrawStatus(
        'İkinci noktaya bir kez tıklayın'
      );

      return;
    }

    if (
      anchorData.time ===
      point.data.time
    ) {
      setDrawStatus(
        'İkinci noktayı farklı bir mum üzerinde seçin'
      );
      return;
    }

    // İkinci tıklamada çizim modu
    // anında kapanır.
    drawingModeRef.current = false;

    const newDrawing = {
      id: `trend-${Date.now()}`,
      time1: anchorData.time,
      price1: anchorData.value,
      time2: point.data.time,
      price2: point.data.value,
    };

    setDrawingMode(false);
    setAnchorData(null);
    setAnchorPixel(null);
    setPreviewPixel(null);
    setDrawStatus('');

    onChange(config.id, {
      drawings: [
        ...(config.drawings || []),
        newDrawing,
      ],
    });
  }

  function handleDrawPointerMove(event) {
    if (
      !drawingModeRef.current ||
      !anchorPixel
    ) {
      return;
    }

    const bounds =
      event.currentTarget
        .getBoundingClientRect();

    setPreviewPixel({
      x:
        event.clientX - bounds.left,
      y:
        event.clientY - bounds.top,
    });
  }

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

    onChange(config.id, {
      symbol: clean,
      drawings: [],
    });
  }

  function toggleIndicator(key) {
    const selected =
      config.indicators || [];

    onChange(config.id, {
      indicators:
        selected.includes(key)
          ? selected.filter(
              (item) => item !== key
            )
          : [...selected, key],
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
      <style jsx>{`
        .chartTile {
          width: 100%;
          min-width: 0;
          height: 430px;
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
        }

        .tileToolbar,
        .indicatorBar {
          flex: 0 0 auto;
          display: flex;
          align-items: center;
          gap: 5px;
          padding: 6px 7px;
          overflow-x: auto;
          border-bottom: 1px solid
            rgba(148,163,184,0.15);
          background:
            rgba(15,23,42,0.98);
        }

        .indicatorBar {
          padding: 4px 7px;
        }

        input,
        select,
        button {
          flex: 0 0 auto;
          min-width: 0;
          height: 28px;
          padding: 0 7px;
          border: 1px solid
            rgba(148,163,184,0.24);
          border-radius: 6px;
          color: #e2e8f0;
          background: #111827;
          font-family: inherit;
          font-size: 9px;
          font-weight: 800;
        }

        input {
          width: 78px;
          text-transform: uppercase;
        }

        button {
          cursor: pointer;
        }

        button.active {
          border-color:
            rgba(56,189,248,0.7);
          color: #7dd3fc;
          background:
            rgba(56,189,248,0.16);
        }

        button.drawing {
          border-color:
            rgba(250,204,21,0.8);
          color: #fde047;
          background:
            rgba(250,204,21,0.14);
        }

        button.removeChart {
          margin-left: auto;
          border-color:
            rgba(239,68,68,0.45);
          color: #fca5a5;
        }

        .chartInfo {
          flex: 0 0 25px;
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

        .drawStatus {
          color: #fde047;
        }

        .error {
          color: #fca5a5;
        }

        .chartArea {
          width: 100%;
          flex: 1 1 auto;
          min-height: 280px;
          position: relative;
          overflow: hidden;
        }

        .chartHost {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
        }

        .drawingOverlay {
          position: absolute;
          inset: 0;
          z-index: 20;
          width: 100%;
          height: 100%;
          display: block;
          cursor: crosshair;
          touch-action: none;
          user-select: none;
        }

        .savedDrawingOverlay {
          position: absolute;
          inset: 0;
          z-index: 12;
          width: 100%;
          height: 100%;
          display: block;
          pointer-events: none;
          overflow: hidden;
        }

        .fullscreen .chartArea {
          min-height: 0;
        }

        @media (max-width: 850px) {
          .chartTile {
            height: 390px;
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
            onChange(config.id, {
              market: event.target.value,
              drawings: [],
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
            onChange(config.id, {
              interval:
                event.target.value,
            })
          }
        >
          <option value="5m">5 dk</option>
          <option value="15m">15 dk</option>
          <option value="60m">1 saat</option>
          <option value="1d">Günlük</option>
        </select>

        <button
          type="button"
          className={
            drawingMode
              ? 'drawing'
              : ''
          }
          onClick={() =>
            setDrawingMode(
              (current) => !current
            )
          }
        >
          ╱ Trend
        </button>

        <button
          type="button"
          disabled={
            !config.drawings?.length
          }
          onClick={() =>
            onChange(config.id, {
              drawings:
                config.drawings.slice(
                  0,
                  -1
                ),
            })
          }
          title="Son trend çizgisini sil"
        >
          ↶ Çizgi
        </button>

        <button
          type="button"
          onClick={() =>
            onFullscreen(config.id)
          }
        >
          {fullscreen
            ? '✕ Küçült'
            : '⛶ Tam ekran'}
        </button>

        <button
          type="button"
          className="removeChart"
          onClick={() =>
            onRemove(config.id)
          }
          title="Bu grafiği kaldır"
        >
          ×
        </button>
      </div>

      <div className="indicatorBar">
        {INDICATORS.map(
          ([
            key,
            title,
            ,
            ,
            color,
          ]) => {
            const selected =
              config.indicators?.includes(
                key
              );

            return (
              <button
                key={key}
                type="button"
                className={
                  selected
                    ? 'active'
                    : ''
                }
                onClick={() =>
                  toggleIndicator(key)
                }
                style={{
                  color:
                    selected
                      ? color
                      : '#cbd5e1',
                  borderColor:
                    selected
                      ? color
                      : 'rgba(148,163,184,0.24)',
                  background:
                    selected
                      ? `${color}1f`
                      : '#111827',
                  boxShadow:
                    selected
                      ? `inset 0 0 0 1px ${color}30`
                      : 'none',
                }}
              >
                {selected ? '✓ ' : ''}
                {title}
              </button>
            );
          }
        )}

        <button
          type="button"
          disabled={
            !config.drawings?.length
          }
          onClick={() =>
            onChange(config.id, {
              drawings: [],
            })
          }
        >
          Çizgileri temizle
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

        {drawStatus ? (
          <span className="drawStatus">
            {drawStatus}
          </span>
        ) : null}

        {error ? (
          <span className="error">
            {error}
          </span>
        ) : null}
      </div>

      <div className="chartArea">
        <div
          ref={hostRef}
          className="chartHost"
        />

        {savedDrawingPixels.length ? (
          <svg
            className="savedDrawingOverlay"
            aria-hidden="true"
          >
            {savedDrawingPixels.map(
              (drawing) => (
                <g key={drawing.id}>
                  <line
                    x1={drawing.x1}
                    y1={drawing.y1}
                    x2={drawing.x2}
                    y2={drawing.y2}
                    stroke="#facc15"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                  <circle
                    cx={drawing.x1}
                    cy={drawing.y1}
                    r="3.5"
                    fill="#facc15"
                    stroke="#111827"
                    strokeWidth="1.25"
                  />
                  <circle
                    cx={drawing.x2}
                    cy={drawing.y2}
                    r="3.5"
                    fill="#facc15"
                    stroke="#111827"
                    strokeWidth="1.25"
                  />
                </g>
              )
            )}
          </svg>
        ) : null}

        {drawingMode ? (
          <svg
            className="drawingOverlay"
            onPointerDown={
              handleDrawPointerDown
            }
            onPointerMove={
              handleDrawPointerMove
            }
            onContextMenu={(event) =>
              event.preventDefault()
            }
          >
            {anchorPixel &&
            previewPixel ? (
              <>
                <line
                  x1={anchorPixel.x}
                  y1={anchorPixel.y}
                  x2={previewPixel.x}
                  y2={previewPixel.y}
                  stroke="#facc15"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />

                <circle
                  cx={anchorPixel.x}
                  cy={anchorPixel.y}
                  r="4"
                  fill="#facc15"
                  stroke="#111827"
                  strokeWidth="1.5"
                />
              </>
            ) : null}
          </svg>
        ) : null}
      </div>
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
  const [fullscreenId, setFullscreenId] =
    useState(null);
  const [saveStatus, setSaveStatus] =
    useState('Ayarlar yükleniyor…');

  useEffect(() => {
    let active = true;

    async function loadSettings() {
      try {
        const snapshot = await getDoc(
          doc(
            firestoreDb,
            'users',
            userId,
            'settings',
            'chart-workspace'
          )
        );

        const saved =
          snapshot.exists()
            ? snapshot.data()
            : {};

        if (
          active &&
          Array.isArray(saved.charts) &&
          saved.charts.length
        ) {
          setCharts(
            saved.charts
              .slice(0, 8)
              .map(normalizeChart)
          );
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
      600
    );

    return () =>
      window.clearTimeout(timer);
  }, [charts, ready, userId]);

  useEffect(() => {
    if (fullscreenId === null) {
      return undefined;
    }

    const previous =
      document.body.style.overflow;

    document.body.style.overflow =
      'hidden';

    function close(event) {
      if (event.key === 'Escape') {
        setFullscreenId(null);
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
  }, [fullscreenId]);

  function updateChart(id, patch) {
    setCharts((current) =>
      current.map((item) =>
        item.id === id
          ? {
              ...item,
              ...patch,
            }
          : item
      )
    );
  }

  function addChart() {
    if (charts.length >= 8) {
      window.alert(
        'Aynı anda en fazla 8 grafik açabilirsiniz.'
      );
      return;
    }

    setCharts((current) => [
      ...current,
      {
        id: `chart-${Date.now()}`,
        market: 'bist',
        symbol: 'ASELS',
        interval: '1d',
        indicators: [],
        drawings: [],
      },
    ]);
  }

  function removeChart(id) {
    if (charts.length <= 1) {
      window.alert(
        'En az bir grafik kalmalıdır.'
      );
      return;
    }

    setCharts((current) =>
      current.filter(
        (item) => item.id !== id
      )
    );

    if (fullscreenId === id) {
      setFullscreenId(null);
    }
  }

  async function saveNow() {
    if (!userId) return;

    try {
      setSaveStatus(
        'Grafikler kaydediliyor…'
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
        'Grafikler ve çizgiler kaydedildi'
      );
    } catch (error) {
      console.error(
        'Grafikler kaydedilemedi:',
        error
      );

      setSaveStatus(
        'Grafikler kaydedilemedi'
      );
    }
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

        .title {
          margin: 0;
          color: #f8fafc;
          font-size: 18px;
        }

        .saveStatus {
          color: #86efac;
          font-size: 10px;
        }

        .headerActions {
          display: flex;
          align-items: center;
          gap: 7px;
        }

        .saveButton {
          min-height: 34px;
          padding: 0 12px;
          border: 1px solid
            rgba(34,197,94,0.50);
          border-radius: 8px;
          color: #86efac;
          background:
            rgba(34,197,94,0.10);
          font-family: inherit;
          font-size: 10px;
          font-weight: 900;
          cursor: pointer;
        }

        .addButton {
          min-height: 34px;
          padding: 0 12px;
          border: 1px solid
            rgba(212,175,55,0.50);
          border-radius: 8px;
          color: #f0d675;
          background:
            rgba(212,175,55,0.10);
          font-family: inherit;
          font-size: 10px;
          font-weight: 900;
          cursor: pointer;
        }

        .chartGrid {
          display: grid;
          grid-template-columns:
            repeat(2, minmax(0, 1fr));
          gap: 10px;
        }

        @media (max-width: 850px) {
          .chartGrid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      <div className="workspaceHeader">
        <div>
          <h2 className="title">
            Çoklu Grafik Ekranı
          </h2>

          <span className="saveStatus">
            ● {saveStatus}
          </span>
        </div>

        <div className="headerActions">
          <button
            type="button"
            className="saveButton"
            onClick={saveNow}
          >
            ✓ Grafikleri Kaydet
          </button>

          <button
            type="button"
            className="addButton"
            onClick={addChart}
          >
            + Grafik Ekle
          </button>
        </div>
      </div>

      <div className="chartGrid">
        {charts.map((config) => (
          <ChartTile
            key={config.id}
            config={config}
            fullscreen={
              fullscreenId === config.id
            }
            onFullscreen={(id) =>
              setFullscreenId(
                fullscreenId === id
                  ? null
                  : id
              )
            }
            onChange={updateChart}
            onRemove={removeChart}
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
        Grafik çizimi: TradingView Lightweight
        Charts • Widget kullanılmaz.
      </p>
    </section>
  );
}
