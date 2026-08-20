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


function fitRecentChartData(
  chart,
  rowCount,
  width
) {
  if (!chart || rowCount <= 0) return;

  const barSpacing =
    width >= 1600
      ? 7
      : width >= 1000
        ? 6
        : 5;

  const timeScale =
    chart.timeScale();

  timeScale.applyOptions({
    barSpacing,
    minBarSpacing: 2,
    rightOffset: 8,
  });

  timeScale.scrollToRealTime();
}

function resizeChartPanes(
  chart,
  host
) {
  if (!chart || !host) return;

  try {
    const panes = chart.panes();

    if (!panes.length) return;

    const totalHeight = Math.max(
      host.clientHeight,
      420
    );

    if (panes.length === 1) {
      panes[0].setHeight(totalHeight);
      return;
    }

    const priceHeight = Math.round(
      totalHeight * (
        panes.length > 2
          ? 0.68
          : 0.78
      )
    );

    const volumeHeight = Math.round(
      totalHeight * 0.12
    );

    panes[0].setHeight(priceHeight);
    panes[1].setHeight(volumeHeight);

    const remainingHeight = Math.max(
      90,
      Math.floor(
        (
          totalHeight -
          priceHeight -
          volumeHeight
        ) /
        Math.max(1, panes.length - 2)
      )
    );

    panes.slice(2).forEach((pane) => {
      pane.setHeight(remainingHeight);
    });
  } catch (error) {
    console.warn(
      'Grafik bölümleri boyutlandırılamadı:',
      error
    );
  }
}


function drawingTimeNumber(time) {
  if (Number.isFinite(Number(time))) {
    return Number(time);
  }

  if (typeof time === 'string') {
    return new Date(time).getTime();
  }

  if (
    time &&
    Number.isFinite(time.year) &&
    Number.isFinite(time.month) &&
    Number.isFinite(time.day)
  ) {
    return Date.UTC(
      time.year,
      time.month - 1,
      time.day
    );
  }

  return 0;
}

function drawingSeriesOptions({
  color,
  title,
  width = 2,
}) {
  return {
    color,
    title,
    lineWidth: width,
    priceLineVisible: false,
    lastValueVisible: false,
    crosshairMarkerVisible: false,
    autoscaleInfoProvider: () => null,
  };
}

function createDrawingSeries(
  chart,
  rows,
  drawings
) {
  if (
    !chart ||
    !rows.length ||
    !Array.isArray(drawings)
  ) {
    return [];
  }

  const created = [];
  const firstTime = rows[0].time;
  const lastTime =
    rows[rows.length - 1].time;

  function addLine(data, options) {
    const valid = data
      .filter(
        (item) =>
          item?.time != null &&
          Number.isFinite(item?.value)
      )
      .sort(
        (a, b) =>
          drawingTimeNumber(a.time) -
          drawingTimeNumber(b.time)
      );

    if (valid.length < 2) return;

    try {
      const line = chart.addSeries(
        LineSeries,
        drawingSeriesOptions(options),
        0
      );

      line.setData(valid);
      created.push(line);
    } catch (error) {
      console.warn(
        'Çizgi oluşturulamadı:',
        error
      );
    }
  }

  drawings.forEach((drawing) => {
    const points =
      Array.isArray(drawing?.points)
        ? drawing.points
        : [];

    if (
      (
        drawing.type === 'support' ||
        drawing.type === 'resistance'
      ) &&
      Number.isFinite(points[0]?.price)
    ) {
      addLine(
        [
          {
            time: firstTime,
            value: points[0].price,
          },
          {
            time: lastTime,
            value: points[0].price,
          },
        ],
        {
          color:
            drawing.type === 'support'
              ? '#22c55e'
              : '#ef4444',
          title:
            drawing.type === 'support'
              ? 'Destek'
              : 'Direnç',
          width: 2,
        }
      );

      return;
    }

    if (
      drawing.type === 'trend' &&
      points.length >= 2
    ) {
      addLine(
        points.slice(0, 2).map(
          (point) => ({
            time: point.time,
            value: point.price,
          })
        ),
        {
          color: '#38bdf8',
          title: 'Trend',
          width: 3,
        }
      );

      return;
    }

    if (
      drawing.type === 'fibonacci' &&
      points.length >= 2
    ) {
      const first = points[0];
      const second = points[1];

      if (
        !Number.isFinite(first.price) ||
        !Number.isFinite(second.price)
      ) {
        return;
      }

      const levels = [
        [0, '#f8fafc'],
        [0.236, '#60a5fa'],
        [0.382, '#22d3ee'],
        [0.5, '#facc15'],
        [0.618, '#fb923c'],
        [0.786, '#f472b6'],
        [1, '#f8fafc'],
      ];

      levels.forEach(
        ([level, color]) => {
          const price =
            first.price +
            (
              second.price -
              first.price
            ) *
              level;

          addLine(
            [
              {
                time: first.time,
                value: price,
              },
              {
                time: second.time,
                value: price,
              },
            ],
            {
              color,
              title:
                `Fib ${(
                  Number(level) * 100
                ).toFixed(1)}%`,
              width:
                level === 0 ||
                level === 1
                  ? 2
                  : 1,
            }
          );
        }
      );
    }
  });

  return created;
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
  const chartHostRef = useRef(null);
  const chartRef = useRef(null);
  const rowsRef = useRef([]);
  const seriesRef = useRef(null);
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
  const [fullscreen, setFullscreen] =
    useState(false);
  const [activeDrawingTool, setActiveDrawingTool] =
    useState(null);
  const [drawings, setDrawings] =
    useState([]);
  const [drawingsReady, setDrawingsReady] =
    useState(false);
  const [drawingStatus, setDrawingStatus] =
    useState('Çizim aracı seçilmedi');
  const [selectedDrawingId, setSelectedDrawingId] =
    useState('');

  const drawingSeriesRef = useRef([]);
  const activeDrawingToolRef = useRef(null);
  const pendingDrawingPointRef = useRef(null);

  restoreCallbackRef.current =
    onRestoreSymbol;
  rowsRef.current = rows;
  activeDrawingToolRef.current =
    activeDrawingTool;

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


  const drawingsRef = useMemo(() => {
    if (!userId) return null;

    const drawingKey = String(symbol)
      .replace(/[^A-Z0-9.-]+/gi, '_')
      .slice(0, 80);

    return doc(
      firestoreDb,
      'users',
      userId,
      'chartDrawings',
      drawingKey
    );
  }, [userId, symbol]);

  useEffect(() => {
    let active = true;

    setDrawingsReady(false);
    setDrawings([]);
    pendingDrawingPointRef.current = null;
    setActiveDrawingTool(null);
    setDrawingStatus(
      'Çizimler yükleniyor…'
    );

    async function loadDrawings() {
      try {
        let savedDrawings = [];

        if (drawingsRef) {
          const snapshot =
            await getDoc(drawingsRef);

          savedDrawings =
            snapshot.exists() &&
            Array.isArray(
              snapshot.data()?.drawings
            )
              ? snapshot.data().drawings
              : [];
        } else {
          const localKey =
            `sky-chart-drawings-v2-${symbol}`;

          const localValue =
            JSON.parse(
              localStorage.getItem(
                localKey
              ) || '[]'
            );

          savedDrawings =
            Array.isArray(localValue)
              ? localValue
              : [];
        }

        if (!active) return;

        setDrawings(savedDrawings);
        setDrawingStatus(
          savedDrawings.length
            ? `${savedDrawings.length} çizim yüklendi`
            : 'Kayıtlı çizim yok'
        );
      } catch (error) {
        console.error(
          'Çizimler yüklenemedi:',
          error
        );

        if (active) {
          setDrawingStatus(
            'Çizimler yüklenemedi'
          );
        }
      } finally {
        if (active) {
          setDrawingsReady(true);
        }
      }
    }

    loadDrawings();

    return () => {
      active = false;
    };
  }, [drawingsRef, symbol]);

  useEffect(() => {
    if (!drawingsReady) return;

    const timer = window.setTimeout(
      async () => {
        try {
          setDrawingStatus(
            'Çizimler kaydediliyor…'
          );

          if (drawingsRef) {
            await setDoc(
              drawingsRef,
              {
                symbol,
                drawings,
                updatedAt:
                  new Date().toISOString(),
              },
              { merge: true }
            );
          } else {
            localStorage.setItem(
              `sky-chart-drawings-v2-${symbol}`,
              JSON.stringify(drawings)
            );
          }

          setDrawingStatus(
            drawings.length
              ? `${drawings.length} çizim kaydedildi`
              : 'Kayıtlı çizim yok'
          );
        } catch (error) {
          console.error(
            'Çizimler kaydedilemedi:',
            error
          );

          setDrawingStatus(
            'Çizimler kaydedilemedi'
          );
        }
      },
      450
    );

    return () =>
      window.clearTimeout(timer);
  }, [
    drawings,
    drawingsReady,
    drawingsRef,
    symbol,
  ]);

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



    series.drawingPreview =
      chart.addSeries(
        LineSeries,
        {
          color: '#f0d675',
          title: 'Önizleme',
          lineWidth: 3,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
          autoscaleInfoProvider:
            () => null,
        },
        0
      );

    function clearDrawingPreview() {
      try {
        series.drawingPreview.setData(
          []
        );
      } catch {}
    }

    function handleDrawingPreview(param) {
      const tool =
        activeDrawingToolRef.current;

      if (
        !tool ||
        !param?.point ||
        param.time == null
      ) {
        clearDrawingPreview();
        return;
      }

      try {
        const panes = chart.panes();
        const pricePaneHeight =
          panes?.[0]?.getHeight?.() ||
          host.clientHeight * 0.68;

        if (
          param.point.y < 0 ||
          param.point.y > pricePaneHeight
        ) {
          clearDrawingPreview();
          return;
        }

        const price =
          series.candles.coordinateToPrice(
            param.point.y
          );

        if (!Number.isFinite(price)) {
          clearDrawingPreview();
          return;
        }

        const previewPoint = {
          time: param.time,
          value: price,
        };

        if (
          tool === 'support' ||
          tool === 'resistance'
        ) {
          series.drawingPreview.applyOptions({
            color:
              tool === 'support'
                ? '#22c55e'
                : '#ef4444',
            title:
              tool === 'support'
                ? 'Destek önizleme'
                : 'Direnç önizleme',
          });

          series.drawingPreview.setData([
            {
              time: rowsRef.current[0]?.time,
              value: price,
            },
            {
              time:
                rowsRef.current[
                  rowsRef.current.length - 1
                ]?.time,
              value: price,
            },
          ]);

          return;
        }

        const firstPoint =
          pendingDrawingPointRef.current;

        if (!firstPoint) {
          clearDrawingPreview();
          return;
        }

        series.drawingPreview.applyOptions({
          color:
            tool === 'fibonacci'
              ? '#f0d675'
              : '#38bdf8',
          title:
            tool === 'fibonacci'
              ? 'Fibonacci önizleme'
              : 'Trend önizleme',
        });

        const previewData = [
          {
            time: firstPoint.time,
            value: firstPoint.price,
          },
          previewPoint,
        ].sort(
          (a, b) =>
            drawingTimeNumber(a.time) -
            drawingTimeNumber(b.time)
        );

        series.drawingPreview.setData(
          previewData
        );
      } catch (error) {
        console.warn(
          'Çizim önizlemesi gösterilemedi:',
          error
        );
      }
    }

    function handleChartClick(param) {
      const tool =
        activeDrawingToolRef.current;

      if (
        !tool ||
        !param?.point ||
        param.time == null
      ) {
        return;
      }

      try {
        const panes = chart.panes();
        const pricePaneHeight =
          panes?.[0]?.getHeight?.() ||
          host.clientHeight * 0.68;

        if (
          param.point.y < 0 ||
          param.point.y > pricePaneHeight
        ) {
          setDrawingStatus(
            'Fiyat grafiği üzerinde tıklayın'
          );
          return;
        }

        const price =
          series.candles.coordinateToPrice(
            param.point.y
          );

        if (!Number.isFinite(price)) {
          return;
        }

        const point = {
          time: param.time,
          price:
            Math.round(price * 10000) /
            10000,
        };

        if (
          tool === 'support' ||
          tool === 'resistance'
        ) {
          setDrawings(
            (current) => [
              ...current,
              {
                id:
                  `${Date.now()}-${Math.random()}`,
                type: tool,
                points: [point],
              },
            ]
          );

          activeDrawingToolRef.current = null;
          setActiveDrawingTool(null);
          clearDrawingPreview();
          setDrawingStatus(
            tool === 'support'
              ? 'Destek çizgisi eklendi'
              : 'Direnç çizgisi eklendi'
          );
          return;
        }

        const firstPoint =
          pendingDrawingPointRef.current;

        if (!firstPoint) {
          pendingDrawingPointRef.current =
            point;

          setDrawingStatus(
            'İlk nokta seçildi; ikinci noktaya tıklayın'
          );
          return;
        }

        setDrawings(
          (current) => [
            ...current,
            {
              id:
                `${Date.now()}-${Math.random()}`,
              type: tool,
              points: [
                firstPoint,
                point,
              ],
            },
          ]
        );

        pendingDrawingPointRef.current = null;
        activeDrawingToolRef.current = null;
        setActiveDrawingTool(null);
        clearDrawingPreview();

        setDrawingStatus(
          tool === 'trend'
            ? 'Trend çizgisi eklendi'
            : 'Fibonacci seviyeleri eklendi'
        );
      } catch (error) {
        console.error(
          'Grafik çizim tıklaması hatası:',
          error
        );

        setDrawingStatus(
          'Çizim noktası seçilemedi'
        );
      }
    }

    chart.subscribeClick(
      handleChartClick
    );

    chart.subscribeCrosshairMove(
      handleDrawingPreview
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

    try {
      const panes = chart.panes();

      panes.forEach((pane, index) => {
        pane.setStretchFactor(
          index === 0
            ? 8
            : index === 1
              ? 1
              : 2
        );
      });
    } catch (paneError) {
      console.warn(
        'Grafik bölüm oranları ayarlanamadı:',
        paneError
      );
    }

    seriesRef.current = series;

    applyData(
      rowsRef.current,
      series
    );

    window.requestAnimationFrame(() => {
      resizeChartPanes(chart, host);

      fitRecentChartData(
        chart,
        rowsRef.current.length,
        host.clientWidth
      );
    });

    const resizeObserver =
      new ResizeObserver(() => {
        chart.applyOptions({
          width: host.clientWidth,
          height: host.clientHeight,
        });

        window.requestAnimationFrame(() => {
          resizeChartPanes(chart, host);
        });
      });

    resizeObserver.observe(host);

    return () => {
      resizeObserver.disconnect();

      chart.unsubscribeClick(
        handleChartClick
      );

      chart.unsubscribeCrosshairMove(
        handleDrawingPreview
      );

      drawingSeriesRef.current = [];
      seriesRef.current = null;
      chartRef.current = null;
      chart.remove();
    };
  }, [
    selectedIndicators,
    interval,
  ]);

  useEffect(() => {
    const chart = chartRef.current;
    const host = chartHostRef.current;
    const series = seriesRef.current;

    applyData(rows, series);

    if (
      !chart ||
      !host ||
      rows.length === 0
    ) {
      return;
    }

    const frame = window.requestAnimationFrame(
      () => {
        resizeChartPanes(
          chart,
          host
        );

        fitRecentChartData(
          chart,
          rows.length,
          host.clientWidth
        );
      }
    );

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [rows]);


  useEffect(() => {
    const chart = chartRef.current;

    if (!chart) return;

    drawingSeriesRef.current.forEach(
      (drawingSeries) => {
        try {
          chart.removeSeries(
            drawingSeries
          );
        } catch {}
      }
    );

    drawingSeriesRef.current =
      createDrawingSeries(
        chart,
        rows,
        drawings
      );
  }, [
    drawings,
    rows,
    selectedIndicators,
    interval,
  ]);

  useEffect(() => {
    const timer = window.setTimeout(
      () => {
        const chart =
          chartRef.current;

        const host =
          chartHostRef.current;

        if (!chart || !host) return;

        chart.applyOptions({
          width: host.clientWidth,
          height: host.clientHeight,
        });

        resizeChartPanes(
          chart,
          host
        );

        fitRecentChartData(
          chart,
          rowsRef.current.length,
          host.clientWidth
        );
      },
      180
    );

    return () =>
      window.clearTimeout(timer);
  }, [fullscreen]);

  useEffect(() => {
    if (!fullscreen) return;

    const previousOverflow =
      document.body.style.overflow;

    document.body.style.overflow =
      'hidden';

    function closeFullscreen(event) {
      if (event.key === 'Escape') {
        setFullscreen(false);
      }
    }

    window.addEventListener(
      'keydown',
      closeFullscreen
    );

    return () => {
      document.body.style.overflow =
        previousOverflow;

      window.removeEventListener(
        'keydown',
        closeFullscreen
      );
    };
  }, [fullscreen]);


  function selectDrawingTool(tool) {
    const nextTool =
      activeDrawingTool === tool
        ? null
        : tool;

    pendingDrawingPointRef.current =
      null;
    activeDrawingToolRef.current =
      nextTool;
    setActiveDrawingTool(nextTool);

    try {
      seriesRef.current
        ?.drawingPreview
        ?.setData([]);
    } catch {}

    if (!nextTool) {
      setDrawingStatus(
        'Çizim aracı kapatıldı'
      );
      return;
    }

    setDrawingStatus(
      tool === 'support'
        ? 'Destek seviyesi için grafiğe tıklayın'
        : tool === 'resistance'
          ? 'Direnç seviyesi için grafiğe tıklayın'
          : tool === 'trend'
            ? 'Trend başlangıç noktasına tıklayın'
            : 'Fibonacci başlangıç noktasına tıklayın'
    );
  }


  function deleteSelectedDrawing() {
    if (!selectedDrawingId) return;

    setDrawings(
      (current) =>
        current.filter(
          (drawing) =>
            drawing.id !==
            selectedDrawingId
        )
    );

    setSelectedDrawingId('');
    pendingDrawingPointRef.current =
      null;
    activeDrawingToolRef.current =
      null;
    setActiveDrawingTool(null);

    try {
      seriesRef.current
        ?.drawingPreview
        ?.setData([]);
    } catch {}

    setDrawingStatus(
      'Seçilen çizim silindi'
    );
  }

  function undoDrawing() {
    pendingDrawingPointRef.current =
      null;
    activeDrawingToolRef.current =
      null;
    setActiveDrawingTool(null);

    setDrawings(
      (current) =>
        current.slice(
          0,
          Math.max(0, current.length - 1)
        )
    );

    setDrawingStatus(
      'Son çizim geri alındı'
    );
  }

  function clearDrawings() {
    if (
      !window.confirm(
        `${symbol} için tüm çizimler silinsin mi?`
      )
    ) {
      return;
    }

    pendingDrawingPointRef.current =
      null;
    activeDrawingToolRef.current =
      null;
    setActiveDrawingTool(null);
    setDrawings([]);
    setDrawingStatus(
      'Çizimler temizlendi'
    );
  }

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

  const latest =
    rows[rows.length - 1];

  return (
    <div
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
          min-height: 0;
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

        .drawingActive {
          color: #f0d675;
          font-weight: 800;
        }

        .drawingTools {
          width: 100%;
          padding-top: 2px;
        }

        .chartHost {
          width: 100%;
          flex: 1;
          min-height: 0;
        }

        .sky-own-chart.fullscreen {
          position: fixed;
          inset: 0;
          z-index: 999999;
          box-sizing: border-box;
          width: 100vw;
          height: 100vh;
          min-height: 0;
          overflow: hidden;
          background: #070d16;
        }

        .fullscreen .toolbar {
          flex: 0 0 auto;
          max-height: 35vh;
          overflow-y: auto;
        }

        .fullscreen .chartHost {
          flex: 1 1 auto;
          min-height: 0;
          height: auto;
        }

        @media (max-width: 700px) {
          .sky-own-chart {
            min-height: 0;
          }

          .chartHost {
            min-height: 0;
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
          {[
            ['support', '— Destek'],
            ['resistance', '— Direnç'],
            ['trend', '╱ Trend'],
            ['fibonacci', 'Fib Fibonacci'],
          ].map(([tool, label]) => (
            <button
              key={tool}
              type="button"
              className={
                activeDrawingTool === tool
                  ? 'active'
                  : ''
              }
              onClick={() =>
                selectDrawingTool(tool)
              }
            >
              {label}
            </button>
          ))}

          <select
            value={selectedDrawingId}
            onChange={(event) =>
              setSelectedDrawingId(
                event.target.value
              )
            }
            disabled={!drawings.length}
            title="Silinecek çizimi seç"
          >
            <option value="">
              Çizim seç…
            </option>

            {drawings.map(
              (drawing, index) => {
                const labels = {
                  support: 'Destek',
                  resistance: 'Direnç',
                  trend: 'Trend',
                  fibonacci: 'Fibonacci',
                };

                return (
                  <option
                    key={drawing.id}
                    value={drawing.id}
                  >
                    {index + 1}.{' '}
                    {labels[drawing.type] ||
                      'Çizim'}
                  </option>
                );
              }
            )}
          </select>

          <button
            type="button"
            disabled={!selectedDrawingId}
            onClick={deleteSelectedDrawing}
          >
            Seçileni sil
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

          <span
            className={
              activeDrawingTool
                ? 'drawingActive'
                : ''
            }
          >
            ✎ {drawingStatus}
          </span>

          {error ? (
            <span className="error">
              {error}
            </span>
          ) : null}
        </div>
      </div>

      <div
        ref={chartHostRef}
        className="chartHost"
      />
    </div>
  );
}
