'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  doc,
  getDoc,
  setDoc,
} from 'firebase/firestore';
import {
  CandlestickSeries,
  ColorType,
  createChart,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
} from 'lightweight-charts';
import { firestoreDb } from '../../lib-firebase';

const STORAGE_KEY =
  'sky-own-chart-settings-v1';

const INDICATORS = [
  ['ema20', 'EMA20'],
  ['ema50', 'EMA50'],
  ['ema200', 'EMA200'],
  ['sma20', 'SMA20'],
  ['sma50', 'SMA50'],
  ['sma200', 'SMA200'],
  ['rsi', 'RSI'],
  ['macd', 'MACD'],
  ['mom', 'MOM'],
];

const VALID_INDICATORS = new Set(
  INDICATORS.map(([key]) => key)
);

const INTERVALS = [
  ['5m', '5 dk'],
  ['15m', '15 dk'],
  ['60m', '1 saat'],
  ['1d', 'Günlük'],
];

const VALID_INTERVALS = new Set(
  INTERVALS.map(([value]) => value)
);

const LINE_OPTIONS = {
  lineWidth: 2,
  priceLineVisible: false,
  crosshairMarkerVisible: false,
};

function average(values) {
  const valid = values.filter(
    Number.isFinite
  );

  if (!valid.length) return null;

  return (
    valid.reduce(
      (total, value) => total + value,
      0
    ) / valid.length
  );
}

function calculateSma(values, period) {
  const output =
    new Array(values.length).fill(null);

  let total = 0;

  for (
    let index = 0;
    index < values.length;
    index += 1
  ) {
    total += values[index];

    if (index >= period) {
      total -= values[index - period];
    }

    if (index >= period - 1) {
      output[index] = total / period;
    }
  }

  return output;
}

function calculateEma(values, period) {
  const output =
    new Array(values.length).fill(null);

  if (values.length < period) {
    return output;
  }

  const multiplier = 2 / (period + 1);
  let previous = average(
    values.slice(0, period)
  );

  output[period - 1] = previous;

  for (
    let index = period;
    index < values.length;
    index += 1
  ) {
    previous =
      values[index] * multiplier +
      previous * (1 - multiplier);

    output[index] = previous;
  }

  return output;
}

function calculateNullableEma(
  values,
  period
) {
  const output =
    new Array(values.length).fill(null);

  const buffer = [];
  let previous = null;
  const multiplier = 2 / (period + 1);

  for (
    let index = 0;
    index < values.length;
    index += 1
  ) {
    const value = values[index];

    if (!Number.isFinite(value)) {
      continue;
    }

    if (previous === null) {
      buffer.push(value);

      if (buffer.length === period) {
        previous = average(buffer);
        output[index] = previous;
      }

      continue;
    }

    previous =
      value * multiplier +
      previous * (1 - multiplier);

    output[index] = previous;
  }

  return output;
}

function calculateRsi(values, period = 14) {
  const output =
    new Array(values.length).fill(null);

  if (values.length <= period) {
    return output;
  }

  let gain = 0;
  let loss = 0;

  for (
    let index = 1;
    index <= period;
    index += 1
  ) {
    const change =
      values[index] - values[index - 1];

    if (change >= 0) {
      gain += change;
    } else {
      loss += Math.abs(change);
    }
  }

  let averageGain = gain / period;
  let averageLoss = loss / period;

  output[period] =
    averageLoss === 0
      ? 100
      : 100 -
        100 /
          (1 +
            averageGain / averageLoss);

  for (
    let index = period + 1;
    index < values.length;
    index += 1
  ) {
    const change =
      values[index] - values[index - 1];

    const currentGain =
      change > 0 ? change : 0;

    const currentLoss =
      change < 0
        ? Math.abs(change)
        : 0;

    averageGain =
      (
        averageGain * (period - 1) +
        currentGain
      ) / period;

    averageLoss =
      (
        averageLoss * (period - 1) +
        currentLoss
      ) / period;

    output[index] =
      averageLoss === 0
        ? 100
        : 100 -
          100 /
            (1 +
              averageGain /
                averageLoss);
  }

  return output;
}

function calculateMacd(values) {
  const fast = calculateEma(values, 12);
  const slow = calculateEma(values, 26);

  const macd = values.map(
    (_, index) =>
      Number.isFinite(fast[index]) &&
      Number.isFinite(slow[index])
        ? fast[index] - slow[index]
        : null
  );

  const signal =
    calculateNullableEma(macd, 9);

  const histogram = macd.map(
    (value, index) =>
      Number.isFinite(value) &&
      Number.isFinite(signal[index])
        ? value - signal[index]
        : null
  );

  return {
    macd,
    signal,
    histogram,
  };
}

function calculateMomentum(
  values,
  period = 10
) {
  return values.map((value, index) => {
    if (
      index < period ||
      !values[index - period]
    ) {
      return null;
    }

    return (
      (value / values[index - period] -
        1) *
      100
    );
  });
}

function lineData(rows, values) {
  return rows
    .map((row, index) => ({
      time: row.time,
      value: values[index],
    }))
    .filter(
      (item) =>
        Number.isFinite(item.value)
    );
}

function applyData(rows, series) {
  if (!series?.candles) return;

  const closes = rows.map(
    (row) => row.close
  );

  series.candles.setData(
    rows.map((row) => ({
      time: row.time,
      open: row.open,
      high: row.high,
      low: row.low,
      close: row.close,
    }))
  );

  series.volume.setData(
    rows.map((row) => ({
      time: row.time,
      value: row.volume || 0,
      color:
        row.close >= row.open
          ? 'rgba(20,184,166,0.50)'
          : 'rgba(239,68,68,0.50)',
    }))
  );

  if (series.ema20) {
    series.ema20.setData(
      lineData(
        rows,
        calculateEma(closes, 20)
      )
    );
  }

  if (series.ema50) {
    series.ema50.setData(
      lineData(
        rows,
        calculateEma(closes, 50)
      )
    );
  }

  if (series.ema200) {
    series.ema200.setData(
      lineData(
        rows,
        calculateEma(closes, 200)
      )
    );
  }

  if (series.sma20) {
    series.sma20.setData(
      lineData(
        rows,
        calculateSma(closes, 20)
      )
    );
  }

  if (series.sma50) {
    series.sma50.setData(
      lineData(
        rows,
        calculateSma(closes, 50)
      )
    );
  }

  if (series.sma200) {
    series.sma200.setData(
      lineData(
        rows,
        calculateSma(closes, 200)
      )
    );
  }

  if (series.rsi) {
    series.rsi.setData(
      lineData(
        rows,
        calculateRsi(closes)
      )
    );
  }

  if (
    series.macd ||
    series.macdSignal ||
    series.macdHistogram
  ) {
    const macd =
      calculateMacd(closes);

    series.macd?.setData(
      lineData(rows, macd.macd)
    );

    series.macdSignal?.setData(
      lineData(rows, macd.signal)
    );

    series.macdHistogram?.setData(
      rows
        .map((row, index) => ({
          time: row.time,
          value:
            macd.histogram[index],
          color:
            macd.histogram[index] >= 0
              ? 'rgba(34,197,94,0.55)'
              : 'rgba(239,68,68,0.55)',
        }))
        .filter(
          (item) =>
            Number.isFinite(item.value)
        )
    );
  }

  if (series.mom) {
    series.mom.setData(
      lineData(
        rows,
        calculateMomentum(closes)
      )
    );
  }
}


function drawingId() {
  return (
    globalThis.crypto?.randomUUID?.() ||
    `drawing-${Date.now()}-${Math.random()}`
  );
}

function createSvgNode(name, attributes = {}) {
  const element = document.createElementNS(
    'http://www.w3.org/2000/svg',
    name
  );

  Object.entries(attributes).forEach(
    ([key, value]) => {
      element.setAttribute(
        key,
        String(value)
      );
    }
  );

  return element;
}

function renderDrawings(
  chart,
  candleSeries,
  svg,
  drawings
) {
  if (
    !chart ||
    !candleSeries ||
    !svg
  ) {
    return;
  }

  const width =
    svg.clientWidth || 0;
  const height =
    svg.clientHeight || 0;

  if (!width || !height) return;

  svg.setAttribute(
    'viewBox',
    `0 0 ${width} ${height}`
  );

  svg.innerHTML = '';

  function appendLine({
    x1,
    y1,
    x2,
    y2,
    color,
    width: lineWidth = 2,
    dash = '',
  }) {
    const line = createSvgNode(
      'line',
      {
        x1,
        y1,
        x2,
        y2,
        stroke: color,
        'stroke-width': lineWidth,
        'stroke-linecap': 'round',
        'vector-effect':
          'non-scaling-stroke',
      }
    );

    if (dash) {
      line.setAttribute(
        'stroke-dasharray',
        dash
      );
    }

    svg.appendChild(line);
  }

  function appendText({
    x,
    y,
    text,
    color,
  }) {
    const label = createSvgNode(
      'text',
      {
        x,
        y,
        fill: color,
        'font-size': 11,
        'font-weight': 800,
        'font-family':
          'system-ui, sans-serif',
      }
    );

    label.textContent = text;
    svg.appendChild(label);
  }

  function appendPoint(x, y, color) {
    svg.appendChild(
      createSvgNode('circle', {
        cx: x,
        cy: y,
        r: 4,
        fill: color,
        stroke: '#07101c',
        'stroke-width': 2,
      })
    );
  }

  for (const drawing of drawings) {
    if (
      drawing.type === 'support' ||
      drawing.type === 'resistance'
    ) {
      const y =
        candleSeries.priceToCoordinate(
          drawing.price
        );

      if (!Number.isFinite(y)) {
        continue;
      }

      const color =
        drawing.type === 'support'
          ? '#22c55e'
          : '#ef4444';

      appendLine({
        x1: 0,
        y1: y,
        x2: width,
        y2: y,
        color,
        width: 2,
        dash: '8 5',
      });

      appendText({
        x: 9,
        y: Math.max(13, y - 6),
        text:
          drawing.type === 'support'
            ? `Destek ${Number(
                drawing.price
              ).toFixed(2)}`
            : `Direnç ${Number(
                drawing.price
              ).toFixed(2)}`,
        color,
      });

      continue;
    }

    const startX =
      chart.timeScale().timeToCoordinate(
        drawing.start?.time
      );

    const endX =
      chart.timeScale().timeToCoordinate(
        drawing.end?.time
      );

    const startY =
      candleSeries.priceToCoordinate(
        drawing.start?.price
      );

    const endY =
      candleSeries.priceToCoordinate(
        drawing.end?.price
      );

    if (
      !Number.isFinite(startX) ||
      !Number.isFinite(endX) ||
      !Number.isFinite(startY) ||
      !Number.isFinite(endY)
    ) {
      continue;
    }

    if (drawing.type === 'trend') {
      appendLine({
        x1: startX,
        y1: startY,
        x2: endX,
        y2: endY,
        color: '#38bdf8',
        width: 3,
      });

      appendPoint(
        startX,
        startY,
        '#38bdf8'
      );

      appendPoint(
        endX,
        endY,
        '#38bdf8'
      );

      continue;
    }

    if (drawing.type === 'fibonacci') {
      const levels = [
        0,
        0.236,
        0.382,
        0.5,
        0.618,
        0.786,
        1,
      ];

      const colors = [
        '#94a3b8',
        '#22c55e',
        '#38bdf8',
        '#eab308',
        '#f97316',
        '#ec4899',
        '#a855f7',
      ];

      const left =
        Math.min(startX, endX);
      const right =
        Math.max(startX, endX);

      levels.forEach(
        (level, index) => {
          const price =
            drawing.start.price +
            (
              drawing.end.price -
              drawing.start.price
            ) *
              level;

          const y =
            candleSeries.priceToCoordinate(
              price
            );

          if (!Number.isFinite(y)) {
            return;
          }

          appendLine({
            x1: left,
            y1: y,
            x2: right,
            y2: y,
            color: colors[index],
            width:
              level === 0 ||
              level === 1
                ? 2
                : 1,
          });

          appendText({
            x: left + 5,
            y: Math.max(12, y - 4),
            text:
              `${level}  ${Number(
                price
              ).toFixed(2)}`,
            color: colors[index],
          });
        }
      );

      appendLine({
        x1: startX,
        y1: startY,
        x2: endX,
        y2: endY,
        color:
          'rgba(240,214,117,0.55)',
        width: 1,
        dash: '5 4',
      });

      appendPoint(
        startX,
        startY,
        '#f0d675'
      );

      appendPoint(
        endX,
        endY,
        '#f0d675'
      );
    }
  }
}

function savedInterval(value) {
  const mapping = {
    '5': '5m',
    '15': '15m',
    '60': '60m',
    D: '1d',
  };

  const normalized =
    mapping[value] || value;

  return VALID_INTERVALS.has(
    normalized
  )
    ? normalized
    : '1d';
}

export default function TradingViewChart({
  symbol = 'NASDAQ:EOSE',
  userId,
  onRestoreSymbol,
}) {
  const rootRef = useRef(null);
  const chartHostRef = useRef(null);
  const drawingOverlayRef = useRef(null);
  const chartRef = useRef(null);
  const rowsRef = useRef([]);
  const seriesRef = useRef(null);
  const drawingsRef = useRef([]);
  const activeToolRef = useRef(null);
  const pendingPointRef = useRef(null);
  const restoreCallbackRef =
    useRef(onRestoreSymbol);
  const restoreTargetRef = useRef(null);
  const firstFitRef = useRef(true);

  const [rows, setRows] = useState([]);
  const [interval, setInterval] =
    useState('1d');
  const [
    selectedIndicators,
    setSelectedIndicators,
  ] = useState([
    'ema20',
    'ema50',
    'rsi',
  ]);
  const [settingsReady, setSettingsReady] =
    useState(false);
  const [loading, setLoading] =
    useState(false);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] =
    useState('');
  const [saveStatus, setSaveStatus] =
    useState('Ayarlar yükleniyor…');
  const [drawings, setDrawings] =
    useState([]);
  const [activeTool, setActiveTool] =
    useState(null);
  const [drawingHint, setDrawingHint] =
    useState('');
  const [fullscreen, setFullscreen] =
    useState(false);

  restoreCallbackRef.current =
    onRestoreSymbol;
  rowsRef.current = rows;
  drawingsRef.current = drawings;
  activeToolRef.current = activeTool;

  const settingsRef = useMemo(() => {
    if (!userId) return null;

    return doc(
      firestoreDb,
      'users',
      userId,
      'settings',
      'tradingview-chart'
    );
  }, [userId]);

  useEffect(() => {
    let active = true;

    async function loadSettings() {
      try {
        let saved = {};

        if (settingsRef) {
          const snapshot =
            await getDoc(settingsRef);

          saved = snapshot.exists()
            ? snapshot.data()
            : {};
        } else {
          saved = JSON.parse(
            localStorage.getItem(
              STORAGE_KEY
            ) || '{}'
          );
        }

        if (!active) return;

        const indicators =
          Array.isArray(saved.indicators)
            ? saved.indicators.filter(
                (item) =>
                  VALID_INDICATORS.has(item)
              )
            : [];

        if (indicators.length) {
          setSelectedIndicators(
            indicators
          );
        }

        setInterval(
          savedInterval(saved.interval)
        );

        if (
          Array.isArray(saved.drawings)
        ) {
          setDrawings(
            saved.drawings.filter(
              (drawing) =>
                drawing &&
                [
                  'support',
                  'resistance',
                  'trend',
                  'fibonacci',
                ].includes(
                  drawing.type
                )
            )
          );
        }

        if (
          typeof saved.symbol ===
            'string' &&
          saved.symbol.includes(':') &&
          saved.symbol !== symbol
        ) {
          restoreTargetRef.current =
            saved.symbol;

          restoreCallbackRef.current?.(
            saved.symbol
          );
        }

        setSaveStatus(
          settingsRef
            ? 'Panel ayarları Firebase’de'
            : 'Panel ayarları bu cihazda'
        );
      } catch (settingsError) {
        console.error(
          'Grafik ayarları okunamadı:',
          settingsError
        );

        setSaveStatus(
          'Ayarlar yüklenemedi'
        );
      } finally {
        if (active) {
          setSettingsReady(true);
        }
      }
    }

    loadSettings();

    return () => {
      active = false;
    };
  }, [settingsRef]);

  useEffect(() => {
    if (!settingsReady) return;

    if (
      restoreTargetRef.current &&
      symbol !== restoreTargetRef.current
    ) {
      return;
    }

    if (
      restoreTargetRef.current === symbol
    ) {
      restoreTargetRef.current = null;
    }

    const timer = window.setTimeout(
      async () => {
        const settings = {
          symbol,
          interval,
          indicators:
            selectedIndicators,
          drawings,
          updatedAt:
            new Date().toISOString(),
        };

        try {
          setSaveStatus(
            'Panel ayarları kaydediliyor…'
          );

          if (settingsRef) {
            await setDoc(
              settingsRef,
              settings,
              { merge: true }
            );

            setSaveStatus(
              'Panel ayarları Firebase’de'
            );
          } else {
            localStorage.setItem(
              STORAGE_KEY,
              JSON.stringify(settings)
            );

            setSaveStatus(
              'Panel ayarları bu cihazda'
            );
          }
        } catch (settingsError) {
          console.error(
            'Grafik ayarları kaydedilemedi:',
            settingsError
          );

          setSaveStatus(
            'Ayarlar kaydedilemedi'
          );
        }
      },
      400
    );

    return () =>
      window.clearTimeout(timer);
  }, [
    symbol,
    interval,
    selectedIndicators,
    drawings,
    settingsReady,
    settingsRef,
  ]);

  useEffect(() => {
    let cancelled = false;

    async function loadRows(
      showLoading = true
    ) {
      if (showLoading) {
        setLoading(true);
      }

      try {
        setError('');

        const [prefix, ...symbolParts] =
          symbol.split(':');

        const cleanSymbol =
          symbolParts.join(':') ||
          prefix;

        const market =
          prefix === 'BIST'
            ? 'bist'
            : 'us';

        const params =
          new URLSearchParams({
            symbol: cleanSymbol,
            market,
            interval,
          });

        const response = await fetch(
          `/api/chart-data?${params}`,
          { cache: 'no-store' }
        );

        const payload =
          await response.json();

        if (
          !response.ok ||
          !payload?.ok
        ) {
          throw new Error(
            payload?.error ||
            'Grafik verisi alınamadı.'
          );
        }

        if (!cancelled) {
          setRows(
            Array.isArray(payload.rows)
              ? payload.rows
              : []
          );

          setUpdatedAt(
            new Intl.DateTimeFormat(
              'tr-TR',
              {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              }
            ).format(new Date())
          );
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError?.message ||
            'Grafik verisi alınamadı.'
          );
        }
      } finally {
        if (
          !cancelled &&
          showLoading
        ) {
          setLoading(false);
        }
      }
    }

    firstFitRef.current = true;
    loadRows(true);

    const timer = window.setInterval(
      () => loadRows(false),
      30000
    );

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [symbol, interval]);

  useEffect(() => {
    const host = chartHostRef.current;

    if (!host) return;

    const chart = createChart(host, {
      width: host.clientWidth,
      height: host.clientHeight,
      layout: {
        background: {
          type: ColorType.Solid,
          color: '#070d16',
        },
        textColor: '#94a3b8',
        panes: {
          separatorColor:
            'rgba(148,163,184,0.14)',
          separatorHoverColor:
            'rgba(56,189,248,0.45)',
          enableResize: true,
        },
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
      crosshair: {
        mode: CrosshairMode.Normal,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
      rightPriceScale: {
        borderColor:
          'rgba(148,163,184,0.18)',
      },
      timeScale: {
        borderColor:
          'rgba(148,163,184,0.18)',
        timeVisible:
          interval !== '1d',
        secondsVisible: false,
        rightOffset: 8,
      },
      localization: {
        locale: 'tr-TR',
      },
    });

    chartRef.current = chart;

    const series = {};

    series.candles = chart.addSeries(
      CandlestickSeries,
      {
        upColor: '#14b8a6',
        downColor: '#ef4444',
        borderVisible: false,
        wickUpColor: '#2dd4bf',
        wickDownColor: '#f87171',
      },
      0
    );

    series.volume = chart.addSeries(
      HistogramSeries,
      {
        priceFormat: {
          type: 'volume',
        },
        priceLineVisible: false,
        lastValueVisible: false,
      },
      1
    );

    if (
      selectedIndicators.includes(
        'ema20'
      )
    ) {
      series.ema20 = chart.addSeries(
        LineSeries,
        {
          ...LINE_OPTIONS,
          color: '#38bdf8',
          title: 'EMA20',
        },
        0
      );
    }

    if (
      selectedIndicators.includes(
        'ema50'
      )
    ) {
      series.ema50 = chart.addSeries(
        LineSeries,
        {
          ...LINE_OPTIONS,
          color: '#f59e0b',
          title: 'EMA50',
        },
        0
      );
    }

    if (
      selectedIndicators.includes(
        'ema200'
      )
    ) {
      series.ema200 = chart.addSeries(
        LineSeries,
        {
          ...LINE_OPTIONS,
          color: '#a855f7',
          title: 'EMA200',
          lineWidth: 3,
        },
        0
      );
    }

    if (
      selectedIndicators.includes(
        'sma20'
      )
    ) {
      series.sma20 = chart.addSeries(
        LineSeries,
        {
          ...LINE_OPTIONS,
          color: '#22c55e',
          title: 'SMA20',
        },
        0
      );
    }

    if (
      selectedIndicators.includes(
        'sma50'
      )
    ) {
      series.sma50 = chart.addSeries(
        LineSeries,
        {
          ...LINE_OPTIONS,
          color: '#f97316',
          title: 'SMA50',
        },
        0
      );
    }

    if (
      selectedIndicators.includes(
        'sma200'
      )
    ) {
      series.sma200 = chart.addSeries(
        LineSeries,
        {
          ...LINE_OPTIONS,
          color: '#ec4899',
          title: 'SMA200',
          lineWidth: 3,
        },
        0
      );
    }

    let paneIndex = 2;

    if (
      selectedIndicators.includes('rsi')
    ) {
      series.rsi = chart.addSeries(
        LineSeries,
        {
          ...LINE_OPTIONS,
          color: '#eab308',
          title: 'RSI14',
        },
        paneIndex
      );

      series.rsi.createPriceLine({
        price: 70,
        color:
          'rgba(239,68,68,0.65)',
        lineWidth: 1,
        axisLabelVisible: true,
        title: '70',
      });

      series.rsi.createPriceLine({
        price: 30,
        color:
          'rgba(34,197,94,0.65)',
        lineWidth: 1,
        axisLabelVisible: true,
        title: '30',
      });

      paneIndex += 1;
    }

    if (
      selectedIndicators.includes(
        'macd'
      )
    ) {
      series.macd = chart.addSeries(
        LineSeries,
        {
          ...LINE_OPTIONS,
          color: '#38bdf8',
          title: 'MACD',
        },
        paneIndex
      );

      series.macdSignal =
        chart.addSeries(
          LineSeries,
          {
            ...LINE_OPTIONS,
            color: '#f59e0b',
            title: 'Sinyal',
          },
          paneIndex
        );

      series.macdHistogram =
        chart.addSeries(
          HistogramSeries,
          {
            priceLineVisible: false,
            lastValueVisible: false,
          },
          paneIndex
        );

      paneIndex += 1;
    }

    if (
      selectedIndicators.includes('mom')
    ) {
      series.mom = chart.addSeries(
        LineSeries,
        {
          ...LINE_OPTIONS,
          color: '#c084fc',
          title: 'MOM10 %',
        },
        paneIndex
      );
    }

    seriesRef.current = series;

    applyData(
      rowsRef.current,
      series
    );

    chart.timeScale().fitContent();

    const redraw = () => {
      renderDrawings(
        chart,
        series.candles,
        drawingOverlayRef.current,
        drawingsRef.current
      );
    };

    const handleChartClick = (param) => {
      const tool =
        activeToolRef.current;

      if (
        !tool ||
        !param?.point
      ) {
        return;
      }

      const mainPaneHeight =
        chart.panes()?.[0]?.getHeight?.() ||
        chartHostRef.current?.clientHeight ||
        0;

      if (
        param.point.y < 0 ||
        param.point.y > mainPaneHeight
      ) {
        setDrawingHint(
          'Çizim noktası ana fiyat grafiğinde seçilmelidir.'
        );
        return;
      }

      const price = Number(
        series.candles.coordinateToPrice(
          param.point.y
        )
      );

      if (
        !Number.isFinite(price) ||
        price <= 0
      ) {
        return;
      }

      if (
        tool === 'support' ||
        tool === 'resistance'
      ) {
        setDrawings((current) => [
          ...current,
          {
            id: drawingId(),
            type: tool,
            price,
          },
        ]);

        pendingPointRef.current = null;
        setActiveTool(null);
        setDrawingHint(
          tool === 'support'
            ? 'Destek çizgisi kaydedildi.'
            : 'Direnç çizgisi kaydedildi.'
        );

        return;
      }

      const pointTime =
        param.time ??
        chart
          .timeScale()
          .coordinateToTime(
            param.point.x
          );

      if (
        pointTime === undefined ||
        pointTime === null
      ) {
        setDrawingHint(
          'Trend veya Fibonacci için mumların bulunduğu alandan bir nokta seçin.'
        );
        return;
      }

      const point = {
        time: pointTime,
        price,
      };

      if (!pendingPointRef.current) {
        pendingPointRef.current =
          point;

        setDrawingHint(
          tool === 'fibonacci'
            ? 'Şimdi Fibonacci bitiş noktasını seçin.'
            : 'Şimdi trend çizgisinin bitiş noktasını seçin.'
        );

        return;
      }

      setDrawings((current) => [
        ...current,
        {
          id: drawingId(),
          type: tool,
          start:
            pendingPointRef.current,
          end: point,
        },
      ]);

      pendingPointRef.current = null;
      setActiveTool(null);

      setDrawingHint(
        tool === 'fibonacci'
          ? 'Fibonacci çizimi kaydedildi.'
          : 'Trend çizgisi kaydedildi.'
      );
    };

    chart.subscribeClick(
      handleChartClick
    );

    chart
      .timeScale()
      .subscribeVisibleLogicalRangeChange(
        redraw
      );

    window.requestAnimationFrame(
      redraw
    );

    const resizeObserver =
      new ResizeObserver(() => {
        chart.applyOptions({
          width: host.clientWidth,
          height: host.clientHeight,
        });

        window.requestAnimationFrame(
          redraw
        );
      });

    resizeObserver.observe(host);

    return () => {
      resizeObserver.disconnect();

      chart.unsubscribeClick(
        handleChartClick
      );

      chart
        .timeScale()
        .unsubscribeVisibleLogicalRangeChange(
          redraw
        );

      seriesRef.current = null;
      chartRef.current = null;
      chart.remove();
    };
  }, [
    selectedIndicators,
    interval,
  ]);

  useEffect(() => {
    applyData(rows, seriesRef.current);

    window.requestAnimationFrame(() => {
      renderDrawings(
        chartRef.current,
        seriesRef.current?.candles,
        drawingOverlayRef.current,
        drawingsRef.current
      );
    });
  }, [rows]);

  useEffect(() => {
    window.requestAnimationFrame(() => {
      renderDrawings(
        chartRef.current,
        seriesRef.current?.candles,
        drawingOverlayRef.current,
        drawings
      );
    });
  }, [drawings]);

  useEffect(() => {
    pendingPointRef.current = null;
    setActiveTool(null);
    setDrawingHint('');
  }, [symbol]);

  useEffect(() => {
    if (!fullscreen) return;

    const previousOverflow =
      document.body.style.overflow;

    document.body.style.overflow =
      'hidden';

    function closeWithEscape(event) {
      if (event.key === 'Escape') {
        setFullscreen(false);
      }
    }

    window.addEventListener(
      'keydown',
      closeWithEscape
    );

    return () => {
      document.body.style.overflow =
        previousOverflow;

      window.removeEventListener(
        'keydown',
        closeWithEscape
      );
    };
  }, [fullscreen]);

  function toggleIndicator(key) {
    setSelectedIndicators(
      (current) =>
        current.includes(key)
          ? current.filter(
              (item) => item !== key
            )
          : [...current, key]
    );
  }

  function chooseDrawingTool(tool) {
    pendingPointRef.current = null;

    if (activeTool === tool) {
      setActiveTool(null);
      setDrawingHint('');
      return;
    }

    setActiveTool(tool);

    if (tool === 'support') {
      setDrawingHint(
        'Destek fiyatını grafikte seçin.'
      );
    } else if (
      tool === 'resistance'
    ) {
      setDrawingHint(
        'Direnç fiyatını grafikte seçin.'
      );
    } else if (
      tool === 'trend'
    ) {
      setDrawingHint(
        'Trend çizgisinin başlangıç noktasını seçin.'
      );
    } else {
      setDrawingHint(
        'Fibonacci başlangıç noktasını seçin.'
      );
    }
  }

  function undoDrawing() {
    setDrawings((current) =>
      current.slice(0, -1)
    );

    pendingPointRef.current = null;
    setActiveTool(null);
    setDrawingHint(
      'Son çizim kaldırıldı.'
    );
  }

  function clearDrawings() {
    if (!drawings.length) return;

    const confirmed = window.confirm(
      'Bu hisseye ait bütün çizimler silinsin mi?'
    );

    if (!confirmed) return;

    setDrawings([]);
    pendingPointRef.current = null;
    setActiveTool(null);
    setDrawingHint(
      'Bütün çizimler temizlendi.'
    );
  }

  const latest =
    rows[rows.length - 1];

  return (
    <div
      ref={rootRef}
      className={
        fullscreen
          ? 'sky-own-chart fullscreen'
          : 'sky-own-chart'
      }
    >
      <style jsx>{`
        .sky-own-chart {
          width: 100%;
          height: 100%;
          min-height: 720px;
          display: flex;
          flex-direction: column;
          gap: 9px;
          color: #f8fafc;
          background: #070d16;
        }

        .toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 9px;
          flex-wrap: wrap;
          padding: 10px;
          border-bottom: 1px solid
            rgba(148, 163, 184, 0.15);
          background: rgba(
            15,
            23,
            42,
            0.92
          );
        }

        .buttonGroup {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
        }

        button,
        select {
          min-height: 32px;
          padding: 0 9px;
          border: 1px solid
            rgba(148, 163, 184, 0.2);
          border-radius: 8px;
          color: #cbd5e1;
          background: rgba(
            255,
            255,
            255,
            0.035
          );
          font-family: inherit;
          font-size: 10px;
          font-weight: 850;
          cursor: pointer;
        }

        button.active {
          border-color:
            rgba(56, 189, 248, 0.65);
          color: #7dd3fc;
          background:
            rgba(56, 189, 248, 0.14);
        }

        button:disabled {
          cursor: default;
          opacity: 0.55;
        }

        .information {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
          width: 100%;
          color: #64748b;
          font-size: 9px;
        }

        .information strong {
          color: #f8fafc;
        }

        .saved {
          color: #86efac;
        }

        .error {
          color: #fca5a5;
        }

        .toolLabel {
          color: #94a3b8;
          font-size: 10px;
          font-weight: 850;
        }

        button.support.active {
          border-color:
            rgba(34, 197, 94, 0.7);
          color: #86efac;
          background:
            rgba(34, 197, 94, 0.14);
        }

        button.resistance.active {
          border-color:
            rgba(239, 68, 68, 0.7);
          color: #fca5a5;
          background:
            rgba(239, 68, 68, 0.14);
        }

        .drawingHint {
          color: #f0d675;
          font-weight: 800;
        }

        .chartStage {
          position: relative;
          width: 100%;
          flex: 1;
          min-height: 620px;
          overflow: hidden;
        }

        .chartHost {
          position: absolute;
          inset: 0;
          z-index: 1;
          width: 100%;
          height: 100%;
        }

        .drawingOverlay {
          position: absolute;
          inset: 0;
          z-index: 3;
          width: 100%;
          height: 100%;
          pointer-events: none;
          overflow: visible;
        }

        .drawingActive {
          cursor: crosshair;
        }

        .sky-own-chart.fullscreen {
          position: fixed;
          inset: 0;
          z-index: 999999;
          box-sizing: border-box;
          width: 100vw;
          height: 100vh;
          height: 100dvh;
          min-height: 0;
          overflow: hidden;
          padding:
            env(safe-area-inset-top)
            env(safe-area-inset-right)
            env(safe-area-inset-bottom)
            env(safe-area-inset-left);
          background: #070d16;
        }

        .fullscreen .toolbar {
          flex: 0 0 auto;
          max-height: 34vh;
          overflow-y: auto;
          border-radius: 0;
        }

        .fullscreen .chartStage {
          flex: 1 1 auto;
          min-height: 0;
          height: auto;
          touch-action: none;
          overscroll-behavior: contain;
        }

        @media (max-width: 700px) {
          .sky-own-chart {
            min-height: 680px;
          }

          .chartStage {
            min-height: 570px;
          }

          .drawingTools {
            width: 100%;
          }

          button,
          select {
            min-height: 30px;
            padding: 0 7px;
            font-size: 9px;
          }
        }
      `}</style>

      <div className="toolbar">
        <div className="buttonGroup">
          {INDICATORS.map(
            ([key, label]) => (
              <button
                key={key}
                type="button"
                className={
                  selectedIndicators.includes(
                    key
                  )
                    ? 'active'
                    : ''
                }
                onClick={() =>
                  toggleIndicator(key)
                }
              >
                {selectedIndicators.includes(
                  key
                )
                  ? '✓ '
                  : ''}
                {label}
              </button>
            )
          )}
        </div>

        <div className="buttonGroup drawingTools">
          <span className="toolLabel">
            Çizim:
          </span>

          <button
            type="button"
            className={
              activeTool === 'support'
                ? 'active support'
                : 'support'
            }
            onClick={() =>
              chooseDrawingTool(
                'support'
              )
            }
          >
            ━ Destek
          </button>

          <button
            type="button"
            className={
              activeTool ===
              'resistance'
                ? 'active resistance'
                : 'resistance'
            }
            onClick={() =>
              chooseDrawingTool(
                'resistance'
              )
            }
          >
            ━ Direnç
          </button>

          <button
            type="button"
            className={
              activeTool === 'trend'
                ? 'active'
                : ''
            }
            onClick={() =>
              chooseDrawingTool('trend')
            }
          >
            ╱ Trend
          </button>

          <button
            type="button"
            className={
              activeTool ===
              'fibonacci'
                ? 'active'
                : ''
            }
            onClick={() =>
              chooseDrawingTool(
                'fibonacci'
              )
            }
          >
            Φ Fibonacci
          </button>

          <button
            type="button"
            disabled={!drawings.length}
            onClick={undoDrawing}
          >
            ↶ Geri al
          </button>

          <button
            type="button"
            disabled={!drawings.length}
            onClick={clearDrawings}
          >
            Temizle
          </button>
        </div>

        <div className="buttonGroup">
          <select
            value={interval}
            onChange={(event) =>
              setInterval(
                event.target.value
              )
            }
          >
            {INTERVALS.map(
              ([value, label]) => (
                <option
                  key={value}
                  value={value}
                >
                  {label}
                </option>
              )
            )}
          </select>

          <button
            type="button"
            disabled={loading}
            onClick={() =>
              window.location.reload()
            }
          >
            {loading
              ? 'Yükleniyor…'
              : '↻ Yenile'}
          </button>

          <button
            type="button"
            className="fullscreenButton"
            onClick={() =>
              setFullscreen(
                (current) => !current
              )
            }
          >
            {fullscreen
              ? '✕ Tam ekrandan çık'
              : '⛶ Tam ekran'}
          </button>
        </div>

        <div className="information">
          <strong>{symbol}</strong>

          {latest ? (
            <span>
              Son: {latest.close}
            </span>
          ) : null}

          <span>
            {rows.length} mum
          </span>

          <span>
            Son güncelleme:{' '}
            {updatedAt || '—'}
          </span>

          <span className="saved">
            ● {saveStatus}
          </span>

          <span>
            Yakın zamanlı veri
          </span>

          {drawingHint ? (
            <span className="drawingHint">
              ✎ {drawingHint}
            </span>
          ) : null}

          <span>
            {drawings.length} kayıtlı çizim
          </span>

          {error ? (
            <span className="error">
              {error}
            </span>
          ) : null}
        </div>
      </div>

      <div
        className={
          activeTool
            ? 'chartStage drawingActive'
            : 'chartStage'
        }
      >
        <div
          ref={chartHostRef}
          className="chartHost"
        />

        <svg
          ref={drawingOverlayRef}
          className="drawingOverlay"
          aria-hidden="true"
        />
      </div>
    </div>
  );
}
