import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BIST_UNIVERSE = [
  'AEFES', 'AGHOL', 'AKBNK', 'AKSA', 'AKSEN', 'ALARK', 'ALFAS', 'ARCLK',
  'ASELS', 'ASTOR', 'BIMAS', 'BRSAN', 'BRYAT', 'BTCIM', 'CANTE', 'CCOLA',
  'CIMSA', 'CWENE', 'DOAS', 'ECILC', 'EGEEN', 'EKGYO', 'ENJSA', 'ENKAI',
  'EREGL', 'FROTO', 'GARAN', 'GESAN', 'GUBRF', 'HALKB', 'HEKTS', 'ISCTR',
  'ISMEN', 'KARSN', 'KCHOL', 'KONTR', 'KOZAA', 'KOZAL', 'KRDMD', 'MGROS',
  'MIATK', 'MPARK', 'ODAS', 'OTKAR', 'OYAKC', 'PETKM', 'PGSUS', 'SAHOL',
  'SASA', 'SISE', 'SOKM', 'TAVHL', 'TCELL', 'THYAO', 'TKFEN', 'TOASO',
  'TSKB', 'TTKOM', 'TUPRS', 'ULKER', 'VAKBN', 'VESTL', 'YKBNK', 'ZOREN',
];

function numberValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function round(value, digits = 2) {
  if (!Number.isFinite(value)) return null;
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
}

function istanbulDateKey(timestampSeconds) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(timestampSeconds * 1000));
}

function calculateEma(values, period) {
  if (!Array.isArray(values) || values.length < period) return [];

  const output = new Array(values.length).fill(null);
  let previous =
    values.slice(0, period).reduce((total, value) => total + value, 0) /
    period;

  output[period - 1] = previous;
  const multiplier = 2 / (period + 1);

  for (let index = period; index < values.length; index += 1) {
    previous =
      (values[index] - previous) * multiplier + previous;
    output[index] = previous;
  }

  return output;
}

function calculateAtr(rows, period = 14) {
  if (rows.length < period + 1) return null;

  const trueRanges = [];

  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index];
    const previousClose = rows[index - 1].close;

    trueRanges.push(
      Math.max(
        row.high - row.low,
        Math.abs(row.high - previousClose),
        Math.abs(row.low - previousClose)
      )
    );
  }

  const recent = trueRanges.slice(-period);
  if (recent.length < period) return null;

  return recent.reduce((total, value) => total + value, 0) / recent.length;
}

function aggregate15Minutes(rows) {
  const buckets = new Map();

  for (const row of rows) {
    const bucketTimestamp = Math.floor(row.timestamp / 900) * 900;
    const current = buckets.get(bucketTimestamp);

    if (!current) {
      buckets.set(bucketTimestamp, {
        timestamp: bucketTimestamp,
        open: row.open,
        high: row.high,
        low: row.low,
        close: row.close,
        volume: row.volume,
      });
      continue;
    }

    current.high = Math.max(current.high, row.high);
    current.low = Math.min(current.low, row.low);
    current.close = row.close;
    current.volume += row.volume;
  }

  return [...buckets.values()].sort(
    (first, second) => first.timestamp - second.timestamp
  );
}

function getVwap(rows) {
  let totalValue = 0;
  let totalVolume = 0;

  for (const row of rows) {
    const typicalPrice = (row.high + row.low + row.close) / 3;
    totalValue += typicalPrice * row.volume;
    totalVolume += row.volume;
  }

  return totalVolume > 0 ? totalValue / totalVolume : null;
}

function getVolumeRatio(rows) {
  const volumes = rows
    .map((row) => row.volume)
    .filter((value) => Number.isFinite(value) && value > 0);

  if (volumes.length < 12) return null;

  const current = volumes[volumes.length - 1];
  const previous = volumes.slice(-21, -1);
  const average =
    previous.reduce((total, value) => total + value, 0) /
    previous.length;

  return average > 0 ? current / average : null;
}

function barsSinceUpCross(fast, slow, lastIndex, maximumBars = 3) {
  for (
    let offset = 0;
    offset <= maximumBars && lastIndex - offset >= 1;
    offset += 1
  ) {
    const index = lastIndex - offset;
    const previousFast = fast[index - 1];
    const previousSlow = slow[index - 1];
    const currentFast = fast[index];
    const currentSlow = slow[index];

    if (
      Number.isFinite(previousFast) &&
      Number.isFinite(previousSlow) &&
      Number.isFinite(currentFast) &&
      Number.isFinite(currentSlow) &&
      previousFast <= previousSlow &&
      currentFast > currentSlow
    ) {
      return offset;
    }
  }

  return null;
}

async function fetchLiquidCandidates() {
  const response = await fetch(
    'https://scanner.tradingview.com/turkey/scan',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 Sky-Finans-Daytrade/1.0',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({
        symbols: {
          tickers: BIST_UNIVERSE.map((symbol) => `BIST:${symbol}`),
          query: { types: [] },
        },
        columns: [
          'close',
          'volume',
          'change',
          'open',
          'high',
          'low',
          'EMA20',
          'EMA50',
        ],
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Likidite servisi ${response.status} hatası verdi.`);
  }

  const payload = await response.json();

  return (payload?.data || [])
    .map((row) => {
      const symbol = String(row?.s || '').split(':').pop();
      const close = numberValue(row?.d?.[0]);
      const volume = numberValue(row?.d?.[1]);
      const changePercent = numberValue(row?.d?.[2]);
      const dailyEma20 = numberValue(row?.d?.[6]);
      const dailyEma50 = numberValue(row?.d?.[7]);

      const dailyTrend =
        Number.isFinite(close) &&
        Number.isFinite(dailyEma20) &&
        Number.isFinite(dailyEma50)
          ? close > dailyEma20 && dailyEma20 >= dailyEma50
          : null;

      return {
        symbol,
        close,
        volume,
        changePercent,
        dailyEma20,
        dailyEma50,
        dailyTrend,
        turnover:
          Number.isFinite(close) && Number.isFinite(volume)
            ? close * volume
            : 0,
      };
    })
    .filter((item) => item.symbol && item.turnover > 0)
    .sort((first, second) => second.turnover - first.turnover)
    .slice(0, 24);
}

function parseYahooRows(payload) {
  const result = payload?.chart?.result?.[0];
  if (!result) return [];

  const timestamps = result.timestamp || [];
  const quote = result.indicators?.quote?.[0] || {};
  const nowSeconds = Date.now() / 1000;
  const rows = [];

  for (let index = 0; index < timestamps.length; index += 1) {
    const timestamp = numberValue(timestamps[index]);
    const open = numberValue(quote.open?.[index]);
    const high = numberValue(quote.high?.[index]);
    const low = numberValue(quote.low?.[index]);
    const close = numberValue(quote.close?.[index]);
    const volume = numberValue(quote.volume?.[index]);

    if (
      !Number.isFinite(timestamp) ||
      timestamp + 300 > nowSeconds ||
      !Number.isFinite(open) ||
      !Number.isFinite(high) ||
      !Number.isFinite(low) ||
      !Number.isFinite(close) ||
      !Number.isFinite(volume)
    ) {
      continue;
    }

    rows.push({ timestamp, open, high, low, close, volume });
  }

  return rows.sort((first, second) => first.timestamp - second.timestamp);
}

function analyzeMarketRegime(allRows) {
  if (allRows.length < 30) {
    return {
      positive: null,
      message: 'BIST 100 yönü doğrulanamadı.',
    };
  }

  const latestDate = istanbulDateKey(allRows[allRows.length - 1].timestamp);
  const sessionRows = allRows.filter(
    (row) => istanbulDateKey(row.timestamp) === latestDate
  );
  const nowSeconds = Date.now() / 1000;
  const fifteenRows = aggregate15Minutes(allRows).filter(
    (row) => row.timestamp + 900 <= nowSeconds
  );

  if (sessionRows.length < 3 || fifteenRows.length < 22) {
    return {
      positive: null,
      message: 'BIST 100 için yeterli tamamlanmış mum yok.',
    };
  }

  const closes = fifteenRows.map((row) => row.close);
  const ema9 = calculateEma(closes, 9);
  const ema20 = calculateEma(closes, 20);
  const lastIndex = fifteenRows.length - 1;
  const vwap = getVwap(sessionRows);
  const price = sessionRows[sessionRows.length - 1].close;
  const emaPositive = ema9[lastIndex] > ema20[lastIndex];
  const vwapPositive = Number.isFinite(vwap) ? price > vwap : false;

  return {
    positive: emaPositive && vwapPositive,
    emaPositive,
    vwapPositive,
    price: round(price),
    vwap: round(vwap),
    sessionDate: latestDate,
    message:
      emaPositive && vwapPositive
        ? 'BIST 100 kısa vadeli yönü olumlu.'
        : 'BIST 100 kısa vadeli yönü henüz olumlu değil.',
  };
}

async function fetchFiveMinuteRows(symbol) {
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/` +
    `${encodeURIComponent(symbol)}.IS?interval=5m&range=5d&events=history`;

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 Sky-Finans-Daytrade/1.0',
      Accept: 'application/json',
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(12000),
  });

  if (!response.ok) return [];
  return parseYahooRows(await response.json());
}

function analyzeCandidate(candidate, allRows, marketRegime) {
  if (allRows.length < 45) return null;

  const latestDate = istanbulDateKey(allRows[allRows.length - 1].timestamp);
  const sessionRows = allRows.filter(
    (row) => istanbulDateKey(row.timestamp) === latestDate
  );

  const olderRows = allRows.filter(
    (row) => istanbulDateKey(row.timestamp) !== latestDate
  );
  const previousDate = olderRows.length
    ? istanbulDateKey(olderRows[olderRows.length - 1].timestamp)
    : null;
  const previousSessionRows = previousDate
    ? olderRows.filter(
        (row) => istanbulDateKey(row.timestamp) === previousDate
      )
    : [];

  if (sessionRows.length < 6) return null;

  const nowSeconds = Date.now() / 1000;
  const fifteenRows = aggregate15Minutes(allRows).filter(
    (row) => row.timestamp + 900 <= nowSeconds
  );
  if (fifteenRows.length < 25) return null;

  const fiveCloses = allRows.map((row) => row.close);
  const fifteenCloses = fifteenRows.map((row) => row.close);
  const emaFiveFast = calculateEma(fiveCloses, 9);
  const emaFiveSlow = calculateEma(fiveCloses, 20);
  const emaFifteenFast = calculateEma(fifteenCloses, 9);
  const emaFifteenSlow = calculateEma(fifteenCloses, 20);
  const lastFiveIndex = allRows.length - 1;
  const lastFifteenIndex = fifteenRows.length - 1;
  const last = allRows[lastFiveIndex];
  const previous = allRows[lastFiveIndex - 1];
  const vwap = getVwap(sessionRows);
  const volumeRatio = getVolumeRatio(sessionRows);
  const atr15 = calculateAtr(fifteenRows);

  if (!Number.isFinite(vwap) || !Number.isFinite(atr15) || atr15 <= 0) {
    return null;
  }

  const fiveTrend =
    emaFiveFast[lastFiveIndex] > emaFiveSlow[lastFiveIndex];
  const fifteenTrend =
    emaFifteenFast[lastFifteenIndex] > emaFifteenSlow[lastFifteenIndex];
  const aboveVwap = last.close > vwap;
  const priceConfirmation = last.close > previous.high;
  const crossBars = barsSinceUpCross(
    emaFifteenFast,
    emaFifteenSlow,
    lastFifteenIndex
  );

  const previousHigh = previousSessionRows.length
    ? Math.max(...previousSessionRows.map((row) => row.high))
    : null;

  let score = 0;
  if (fifteenTrend) score += 20;
  if (fiveTrend) score += 15;
  if (aboveVwap) score += 15;
  if (Number.isFinite(volumeRatio) && volumeRatio >= 1.5) score += 15;
  else if (Number.isFinite(volumeRatio) && volumeRatio >= 1.1) score += 7;
  if (priceConfirmation) score += 15;
  if (crossBars !== null) score += 10;
  if (candidate.dailyTrend === true) score += 5;
  if (marketRegime?.positive === true) score += 5;

  const recentLow = Math.min(...sessionRows.slice(-6).map((row) => row.low));
  const atrStop = last.close - atr15 * 0.75;
  const stop = Math.min(
    last.close * 0.995,
    Math.max(recentLow, atrStop)
  );
  const riskPerShare = last.close - stop;

  if (!Number.isFinite(riskPerShare) || riskPerShare <= 0) return null;

  const target1 = last.close + riskPerShare * 2;
  const nearestResistance =
    Number.isFinite(previousHigh) && previousHigh > last.close
      ? previousHigh
      : null;
  const hasResistanceRoom =
    !Number.isFinite(nearestResistance) || nearestResistance >= target1;
  const strongVolume =
    Number.isFinite(volumeRatio) && volumeRatio >= 1.5;
  const dailyTrendAcceptable = candidate.dailyTrend === true;
  const marketAcceptable = marketRegime?.positive === true;

  const setup =
    score >= 85 &&
    fifteenTrend &&
    fiveTrend &&
    aboveVwap &&
    priceConfirmation &&
    strongVolume &&
    dailyTrendAcceptable &&
    marketAcceptable &&
    hasResistanceRoom
      ? 'İŞLEM SİNYALİ'
      : score >= 70 && fifteenTrend && aboveVwap
        ? 'ONAY BEKLİYOR'
        : 'İZLE';

  return {
    symbol: candidate.symbol,
    sessionDate: latestDate,
    setup,
    score,
    price: round(last.close),
    changePercent: round(candidate.changePercent),
    vwap: round(vwap),
    volumeRatio: round(volumeRatio),
    ema5Fast: round(emaFiveFast[lastFiveIndex]),
    ema5Slow: round(emaFiveSlow[lastFiveIndex]),
    ema15Fast: round(emaFifteenFast[lastFifteenIndex]),
    ema15Slow: round(emaFifteenSlow[lastFifteenIndex]),
    fiveTrend,
    fifteenTrend,
    aboveVwap,
    priceConfirmation,
    strongVolume,
    dailyTrend: candidate.dailyTrend,
    marketPositive: marketRegime?.positive ?? null,
    previousHigh: round(previousHigh),
    nearestResistance: round(nearestResistance),
    hasResistanceRoom,
    crossBars,
    entry: round(last.close),
    stop: round(stop),
    target1: round(target1),
    target2: round(last.close + riskPerShare * 3),
    riskPerShare: round(riskPerShare),
    riskReward: 2,
    lastBarTimestamp: last.timestamp,
  };
}

async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function run() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;

      try {
        results[index] = await worker(items[index]);
      } catch (error) {
        console.error(
          `${items[index]?.symbol || 'BIST'} intraday veri hatası:`,
          error?.message || error
        );
        results[index] = null;
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => run())
  );

  return results;
}

export async function GET() {
  try {
    const startedAt = Date.now();
    const [candidates, indexRows] = await Promise.all([
      fetchLiquidCandidates(),
      fetchFiveMinuteRows('XU100'),
    ]);
    const marketRegime = analyzeMarketRegime(indexRows);

    const analyses = await mapWithConcurrency(
      candidates,
      8,
      async (candidate) => {
        const rows = await fetchFiveMinuteRows(candidate.symbol);
        return analyzeCandidate(candidate, rows, marketRegime);
      }
    );

    const valid = analyses
      .filter(Boolean)
      .sort((first, second) => second.score - first.score);

    const actionable = valid.slice(0, 3);

    return NextResponse.json({
      ok: true,
      mode: 'paper-trade',
      generatedAt: new Date().toISOString(),
      scanned: candidates.length,
      analyzed: valid.length,
      marketRegime,
      items: actionable,
      message: actionable.length
        ? ''
        : 'Şartları karşılayan güvenilir bir aday bulunamadı.',
      durationMs: Date.now() - startedAt,
    });
  } catch (error) {
    console.error('BIST günlük trade tarama hatası:', error);

    return NextResponse.json(
      {
        ok: false,
        items: [],
        error:
          error?.message ||
          'BIST günlük trade verileri alınamadı.',
      },
      { status: 500 }
    );
  }
}
