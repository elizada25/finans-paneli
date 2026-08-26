import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const PRICE_FLOOR = 3;
const CACHE_MS = 5 * 60 * 1000;

const NASDAQ_UNIVERSE = [
  'AAPL', 'MSFT', 'NVDA', 'AMZN', 'META', 'GOOGL', 'GOOG', 'TSLA',
  'AVGO', 'COST', 'NFLX', 'AMD', 'INTC', 'CSCO', 'QCOM', 'AMAT',
  'MU', 'LRCX', 'KLAC', 'ASML', 'ARM', 'MRVL', 'ADI', 'TXN',
  'PANW', 'CRWD', 'FTNT', 'ZS', 'DDOG', 'NET', 'MDB', 'SNOW',
  'PLTR', 'COIN', 'HOOD', 'MSTR', 'PYPL', 'SHOP', 'MELI', 'ABNB',
  'BKNG', 'SBUX', 'PEP', 'GILD', 'AMGN', 'ISRG', 'REGN', 'VRTX',
];

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function round(value, digits = 2) {
  const number = finite(value);
  if (number === null) return null;
  const factor = 10 ** digits;
  return Math.round(number * factor) / factor;
}

function ema(values, period) {
  if (!values.length) return [];
  const multiplier = 2 / (period + 1);
  const output = [values[0]];

  for (let index = 1; index < values.length; index += 1) {
    output.push(
      values[index] * multiplier +
      output[index - 1] * (1 - multiplier)
    );
  }

  return output;
}

function calculateRsi(values, period = 14) {
  const output = new Array(values.length).fill(null);
  if (values.length <= period) return output;

  let gains = 0;
  let losses = 0;

  for (let index = 1; index <= period; index += 1) {
    const change = values[index] - values[index - 1];
    gains += Math.max(change, 0);
    losses += Math.max(-change, 0);
  }

  let averageGain = gains / period;
  let averageLoss = losses / period;
  output[period] = averageLoss === 0
    ? 100
    : 100 - 100 / (1 + averageGain / averageLoss);

  for (let index = period + 1; index < values.length; index += 1) {
    const change = values[index] - values[index - 1];
    averageGain =
      (averageGain * (period - 1) + Math.max(change, 0)) / period;
    averageLoss =
      (averageLoss * (period - 1) + Math.max(-change, 0)) / period;
    output[index] = averageLoss === 0
      ? 100
      : 100 - 100 / (1 + averageGain / averageLoss);
  }

  return output;
}

function calculateAtr(rows, period = 14) {
  if (rows.length < period + 1) return null;
  const ranges = [];

  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index];
    const previous = rows[index - 1];
    ranges.push(Math.max(
      row.high - row.low,
      Math.abs(row.high - previous.close),
      Math.abs(row.low - previous.close)
    ));
  }

  const recent = ranges.slice(-period);
  return recent.reduce((total, value) => total + value, 0) / recent.length;
}

function macdHistogram(values) {
  if (values.length < 35) return [];
  const fast = ema(values, 12);
  const slow = ema(values, 26);
  const macd = values.map((_, index) => fast[index] - slow[index]);
  const signal = ema(macd, 9);
  return macd.map((value, index) => value - signal[index]);
}

function newYorkParts(timestamp) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(timestamp * 1000));

  const result = {};
  for (const part of parts) result[part.type] = part.value;

  return {
    date: `${result.year}-${result.month}-${result.day}`,
    minutes: Number(result.hour) * 60 + Number(result.minute),
  };
}

function rowsFromPayload(payload) {
  const result = payload?.chart?.result?.[0];
  const timestamps = result?.timestamp || [];
  const quote = result?.indicators?.quote?.[0] || {};
  const rows = [];

  for (let index = 0; index < timestamps.length; index += 1) {
    const open = finite(quote.open?.[index]);
    const high = finite(quote.high?.[index]);
    const low = finite(quote.low?.[index]);
    const close = finite(quote.close?.[index]);
    const volume = finite(quote.volume?.[index]) || 0;

    if ([open, high, low, close].some((value) => value === null)) continue;
    rows.push({ time: timestamps[index], open, high, low, close, volume });
  }

  return rows;
}

async function fetchYahoo(symbol, interval, range) {
  const query = new URLSearchParams({
    interval,
    range,
    events: 'history',
    includePrePost: 'false',
  });

  const urls = [
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?${query}`,
    `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?${query}`,
  ];

  let lastError = null;
  for (const url of urls) {
    try {
      const response = await fetch(url, {
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Mozilla/5.0 Sky-Finans-Nasdaq-4H/1.0',
        },
        signal: AbortSignal.timeout(12000),
      });

      if (!response.ok) {
        lastError = new Error(`Yahoo HTTP ${response.status}`);
        continue;
      }

      const payload = await response.json();
      const error = payload?.chart?.error;
      if (error) {
        lastError = new Error(error.description || error.code || 'Yahoo hatası');
        continue;
      }

      return rowsFromPayload(payload);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error(`${symbol} verisi alınamadı.`);
}

function aggregateClosedFourHourRows(hourlyRows) {
  const nowSeconds = Date.now() / 1000;
  const groups = new Map();

  for (const row of hourlyRows) {
    if (row.time + 3600 > nowSeconds) continue;
    const parts = newYorkParts(row.time);

    // NASDAQ normal seansının ilk dört kapalı saatlik mumu:
    // 09:30, 10:30, 11:30 ve 12:30 ET.
    if (parts.minutes < 570 || parts.minutes >= 810) continue;

    if (!groups.has(parts.date)) groups.set(parts.date, []);
    groups.get(parts.date).push(row);
  }

  const output = [];
  for (const rows of groups.values()) {
    rows.sort((first, second) => first.time - second.time);
    const firstFour = rows.slice(0, 4);
    if (firstFour.length !== 4) continue;

    output.push({
      time: firstFour[3].time + 3600,
      open: firstFour[0].open,
      high: Math.max(...firstFour.map((row) => row.high)),
      low: Math.min(...firstFour.map((row) => row.low)),
      close: firstFour[3].close,
      volume: firstFour.reduce((total, row) => total + row.volume, 0),
    });
  }

  return output.sort((first, second) => first.time - second.time);
}

function analyzeSymbol(symbol, dailyRows, fourHourRows, marketPositive) {
  if (dailyRows.length < 210 || fourHourRows.length < 35) return null;

  const dailyCloses = dailyRows.map((row) => row.close);
  const closes = fourHourRows.map((row) => row.close);
  const last = fourHourRows.at(-1);
  const previous = fourHourRows.at(-2);
  const lastDaily = dailyRows.at(-1);
  const previousDaily = dailyRows.at(-2);

  if (last.close < PRICE_FLOOR) return null;

  const averageDollarVolume = dailyRows
    .slice(-20)
    .reduce((total, row) => total + row.close * row.volume, 0) / 20;

  if (averageDollarVolume < 20_000_000) return null;

  const ema9 = ema(closes, 9);
  const ema20 = ema(closes, 20);
  const dailyEma20 = ema(dailyCloses, 20);
  const dailyEma50 = ema(dailyCloses, 50);
  const dailyEma200 = ema(dailyCloses, 200);
  const rsiValues = calculateRsi(closes);
  const histogram = macdHistogram(closes);
  const lastIndex = closes.length - 1;
  const rsi = rsiValues[lastIndex];
  const atr = calculateAtr(fourHourRows);

  if (![rsi, atr].every(Number.isFinite)) return null;

  const fourHourTrend = ema9[lastIndex] > ema20[lastIndex];
  const aboveEma20 = last.close > ema20[lastIndex];
  const dailyTrend =
    lastDaily.close > dailyEma50.at(-1) &&
    dailyEma20.at(-1) > dailyEma50.at(-1) &&
    lastDaily.close > dailyEma200.at(-1);
  const breakout = last.close > previous.high;
  const macdPositive = histogram.at(-1) > 0;
  const macdRising = histogram.at(-1) > histogram.at(-2);

  const previousVolumes = fourHourRows.slice(-21, -1).map((row) => row.volume);
  const averageVolume = previousVolumes.reduce((a, b) => a + b, 0) /
    Math.max(1, previousVolumes.length);
  const volumeRatio = averageVolume > 0 ? last.volume / averageVolume : 0;
  const healthyRsi = rsi >= 45 && rsi <= 70;

  const recentLow = Math.min(...fourHourRows.slice(-4).map((row) => row.low));
  const rawStop = Math.max(recentLow, last.close - atr * 1.25, last.close * 0.94);
  const stop = Math.min(last.close * 0.995, rawStop);
  const risk = last.close - stop;
  if (!(risk > 0)) return null;

  const target1 = last.close + risk * 2;
  const target2 = last.close + risk * 3;
  const resistance = Math.max(...dailyRows.slice(-21, -1).map((row) => row.high));
  const resistanceRoom = last.close > resistance || resistance >= target1;

  let score = 0;
  if (dailyTrend) score += 15;
  if (fourHourTrend) score += 20;
  if (aboveEma20) score += 10;
  if (breakout) score += 15;
  if (macdPositive && macdRising) score += 10;
  else if (macdPositive || macdRising) score += 5;
  if (healthyRsi) score += 10;
  if (volumeRatio >= 1.2) score += 15;
  else if (volumeRatio >= 1) score += 7;
  if (marketPositive) score += 10;
  if (resistanceRoom) score += 5;
  score = Math.min(100, score);

  const signalReady =
    score >= 75 &&
    fourHourTrend &&
    aboveEma20 &&
    volumeRatio >= 1.2 &&
    (breakout || macdRising);

  const setup = signalReady
    ? 'İŞLEM SİNYALİ'
    : score >= 60
      ? 'ONAY BEKLİYOR'
      : score >= 45
        ? 'İZLE'
        : 'UYGUN DEĞİL';

  const reasons = [];
  const missing = [];
  const condition = (ok, good, bad) => (ok ? reasons.push(good) : missing.push(bad));
  condition(dailyTrend, 'Günlük ana trend pozitif', 'Günlük ana trend henüz pozitif değil');
  condition(fourHourTrend, '4 saatlik EMA9, EMA20 üzerinde', '4 saatlik EMA9, EMA20 altında');
  condition(aboveEma20, 'Fiyat 4 saatlik EMA20 üzerinde', 'Fiyat 4 saatlik EMA20 altında');
  condition(breakout, 'Kapanmış 4 saatlik mum fiyat teyidi verdi', '4 saatlik fiyat teyidi bekleniyor');
  condition(macdPositive && macdRising, 'MACD pozitif ve güçleniyor', 'MACD tam teyit vermedi');
  condition(healthyRsi, `RSI dengeli bölgede (${round(rsi)})`, `RSI uygun bölgede değil (${round(rsi)})`);
  condition(volumeRatio >= 1.2, `Hacim ${round(volumeRatio)} kat`, `Hacim 1,20 katın altında (${round(volumeRatio)})`);
  condition(marketPositive, 'QQQ piyasa filtresi olumlu', 'QQQ piyasa filtresi olumsuz');
  condition(resistanceRoom, 'Hedefe kadar direnç alanı var', 'Yakın direnç hedef alanını daraltıyor');

  return {
    symbol,
    setup,
    score,
    price: round(last.close),
    changePercent: round(
      ((lastDaily.close - previousDaily.close) / previousDaily.close) * 100
    ),
    rsi: round(rsi),
    volumeRatio: round(volumeRatio),
    averageDollarVolume: round(averageDollarVolume, 0),
    ema9: round(ema9[lastIndex]),
    ema20: round(ema20[lastIndex]),
    dailyEma50: round(dailyEma50.at(-1)),
    dailyEma200: round(dailyEma200.at(-1)),
    fourHourTrend,
    dailyTrend,
    aboveEma20,
    breakout,
    macdPositive,
    macdRising,
    marketPositive,
    resistanceRoom,
    entry: round(last.close),
    stop: round(stop),
    target1: round(target1),
    target2: round(target2),
    riskPercent: round((risk / last.close) * 100),
    resistance: round(resistance),
    dataTime: new Date(last.time * 1000).toISOString(),
    reasons,
    missing,
  };
}

async function mapWithConcurrency(items, limit, callback) {
  const results = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      try {
        results[index] = await callback(items[index]);
      } catch (error) {
        console.warn(`NASDAQ 4H ${items[index]} taranamadı:`, error?.message || error);
        results[index] = null;
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker())
  );
  return results;
}

async function analyzeMarket() {
  const [dailyRows, hourlyRows] = await Promise.all([
    fetchYahoo('QQQ', '1d', '1y'),
    fetchYahoo('QQQ', '1h', '3mo'),
  ]);
  const fourHourRows = aggregateClosedFourHourRows(hourlyRows);
  if (dailyRows.length < 60 || fourHourRows.length < 21) return false;
  const dailyCloses = dailyRows.map((row) => row.close);
  const closes = fourHourRows.map((row) => row.close);
  return (
    dailyRows.at(-1).close > ema(dailyCloses, 50).at(-1) &&
    ema(closes, 9).at(-1) > ema(closes, 20).at(-1)
  );
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const force = searchParams.get('refresh') === '1';
    const cached = globalThis.__skyNasdaqFourHourCache;

    if (!force && cached && Date.now() - cached.savedAt < CACHE_MS) {
      return NextResponse.json(cached.payload);
    }

    const marketPositive = await analyzeMarket().catch(() => false);
    const analyses = await mapWithConcurrency(
      NASDAQ_UNIVERSE,
      8,
      async (symbol) => {
        const [dailyRows, hourlyRows] = await Promise.all([
          fetchYahoo(symbol, '1d', '1y'),
          fetchYahoo(symbol, '1h', '3mo'),
        ]);
        return analyzeSymbol(
          symbol,
          dailyRows,
          aggregateClosedFourHourRows(hourlyRows),
          marketPositive
        );
      }
    );

    const items = analyses
      .filter(Boolean)
      .sort((first, second) =>
        second.score - first.score ||
        second.averageDollarVolume - first.averageDollarVolume
      );

    const payload = {
      ok: true,
      generatedAt: new Date().toISOString(),
      priceFloor: PRICE_FLOOR,
      universe: NASDAQ_UNIVERSE.length,
      scanned: analyses.filter(Boolean).length,
      marketPositive,
      counts: {
        signals: items.filter((item) => item.setup === 'İŞLEM SİNYALİ').length,
        waiting: items.filter((item) => item.setup === 'ONAY BEKLİYOR').length,
        watch: items.filter((item) => item.setup === 'İZLE').length,
      },
      items,
      note: 'Tarama yalnızca kapanmış 4 saatlik normal seans mumlarını kullanır ve emir göndermez.',
    };

    globalThis.__skyNasdaqFourHourCache = { savedAt: Date.now(), payload };
    return NextResponse.json(payload);
  } catch (error) {
    console.error('NASDAQ 4H radar hatası:', error);
    return NextResponse.json(
      { ok: false, error: error?.message || 'NASDAQ 4H taraması yapılamadı.' },
      { status: 500 }
    );
  }
}
