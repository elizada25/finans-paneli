import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BIST_SYMBOLS = [
  'AKBNK', 'ARCLK', 'ASELS', 'BIMAS',
  'EKGYO', 'ENKAI', 'EREGL', 'FROTO',
  'GARAN', 'GUBRF', 'ISCTR', 'KCHOL',
  'KOZAA', 'KOZAL', 'KRDMD', 'PETKM',
  'PGSUS', 'SAHOL', 'SASA', 'SISE',
  'TAVHL', 'TCELL', 'THYAO', 'TOASO',
  'TTKOM', 'TUPRS', 'VESTL', 'YKBNK',
  'AEFES', 'AKSA', 'AKSEN', 'ALARK',
  'DOHOL', 'HEKTS', 'MGROS', 'OYAKC',
];

const CACHE_TTL = 5 * 60 * 1000;

let memoryCache = {
  expiresAt: 0,
  payload: null,
};

function round(value, digits = 2) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return null;
  }

  const multiplier = 10 ** digits;

  return (
    Math.round(number * multiplier) /
    multiplier
  );
}

function ema(values, period) {
  if (!values.length) return [];

  const multiplier = 2 / (period + 1);
  const output = [values[0]];

  for (
    let index = 1;
    index < values.length;
    index += 1
  ) {
    output.push(
      values[index] * multiplier +
      output[index - 1] *
        (1 - multiplier)
    );
  }

  return output;
}

function rsi(values, period = 14) {
  const output =
    new Array(values.length).fill(null);

  if (values.length <= period) {
    return output;
  }

  let gainTotal = 0;
  let lossTotal = 0;

  for (
    let index = 1;
    index <= period;
    index += 1
  ) {
    const difference =
      values[index] - values[index - 1];

    gainTotal += Math.max(
      difference,
      0
    );

    lossTotal += Math.max(
      -difference,
      0
    );
  }

  let averageGain =
    gainTotal / period;

  let averageLoss =
    lossTotal / period;

  output[period] =
    averageLoss === 0
      ? 100
      : 100 -
        100 /
          (
            1 +
            averageGain /
              averageLoss
          );

  for (
    let index = period + 1;
    index < values.length;
    index += 1
  ) {
    const difference =
      values[index] - values[index - 1];

    const gain = Math.max(
      difference,
      0
    );

    const loss = Math.max(
      -difference,
      0
    );

    averageGain =
      (
        averageGain *
          (period - 1) +
        gain
      ) /
      period;

    averageLoss =
      (
        averageLoss *
          (period - 1) +
        loss
      ) /
      period;

    output[index] =
      averageLoss === 0
        ? 100
        : 100 -
          100 /
            (
              1 +
              averageGain /
                averageLoss
            );
  }

  return output;
}

function finiteMinimum(values) {
  const valid = values.filter(
    Number.isFinite
  );

  return valid.length
    ? Math.min(...valid)
    : null;
}

function findLowIndex(
  rows,
  start,
  end
) {
  let result = null;

  for (
    let index = start;
    index < end;
    index += 1
  ) {
    if (
      !rows[index] ||
      !Number.isFinite(rows[index].low)
    ) {
      continue;
    }

    if (
      result === null ||
      rows[index].low <
        rows[result].low
    ) {
      result = index;
    }
  }

  return result;
}

async function fetchRows(symbol) {
  const query =
    new URLSearchParams({
      interval: '1d',
      range: '6mo',
      events: 'history',
      includePrePost: 'false',
    });

  const encoded = encodeURIComponent(
    `${symbol}.IS`
  );

  const urls = [
    `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?${query}`,
    `https://query2.finance.yahoo.com/v8/finance/chart/${encoded}?${query}`,
  ];

  let lastError = null;

  for (const url of urls) {
    try {
      const response = await fetch(url, {
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
          'User-Agent':
            'Mozilla/5.0 Sky-Finans-Reversal/1.0',
        },
        signal:
          AbortSignal.timeout(12000),
      });

      if (!response.ok) {
        lastError =
          `Yahoo HTTP ${response.status}`;
        continue;
      }

      const payload =
        await response.json();

      const result =
        payload?.chart?.result?.[0];

      const timestamps =
        result?.timestamp || [];

      const quote =
        result?.indicators
          ?.quote?.[0] || {};

      const rows = timestamps
        .map((timestamp, index) => ({
          time: Number(timestamp),
          open: Number(
            quote.open?.[index]
          ),
          high: Number(
            quote.high?.[index]
          ),
          low: Number(
            quote.low?.[index]
          ),
          close: Number(
            quote.close?.[index]
          ),
          volume: Number(
            quote.volume?.[index] || 0
          ),
        }))
        .filter(
          (row) =>
            Number.isFinite(row.time) &&
            Number.isFinite(row.open) &&
            Number.isFinite(row.high) &&
            Number.isFinite(row.low) &&
            Number.isFinite(row.close)
        );

      if (rows.length >= 60) {
        return rows;
      }

      lastError =
        'Yeterli günlük veri yok';
    } catch (error) {
      lastError =
        error?.message ||
        'Veri alınamadı';
    }
  }

  throw new Error(
    `${symbol}: ${lastError}`
  );
}

function analyze(symbol, rows) {
  if (rows.length < 60) {
    return null;
  }

  const closes = rows.map(
    (row) => row.close
  );

  const volumes = rows.map(
    (row) => row.volume || 0
  );

  const ema5 = ema(closes, 5);
  const ema9 = ema(closes, 9);
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const ema50 = ema(closes, 50);
  const ema200 = ema(closes, 200);
  const rsi14 = rsi(closes, 14);

  const macd = closes.map(
    (_, index) =>
      ema12[index] -
      ema26[index]
  );

  const signal = ema(macd, 9);

  const histogram = macd.map(
    (value, index) =>
      value - signal[index]
  );

  const lastIndex =
    rows.length - 1;

  const last = rows[lastIndex];
  const previous =
    rows[lastIndex - 1];

  const currentRsi =
    rsi14[lastIndex];

  const previousRsi =
    rsi14[lastIndex - 1];

  const previousVolumes =
    volumes.slice(-21, -1)
      .filter(
        (value) =>
          Number.isFinite(value) &&
          value > 0
      );

  const averageVolume =
    previousVolumes.length
      ? previousVolumes.reduce(
          (total, value) =>
            total + value,
          0
        ) /
        previousVolumes.length
      : null;

  const volumeRatio =
    Number.isFinite(averageVolume) &&
    averageVolume > 0
      ? last.volume /
        averageVolume
      : null;

  const recentStart =
    Math.max(0, rows.length - 7);

  const previousStart =
    Math.max(0, rows.length - 14);

  const previousEnd =
    recentStart;

  const recentLowIndex =
    findLowIndex(
      rows,
      recentStart,
      rows.length
    );

  const previousLowIndex =
    findLowIndex(
      rows,
      previousStart,
      previousEnd
    );

  const bullishDivergence =
    recentLowIndex !== null &&
    previousLowIndex !== null &&
    Number.isFinite(
      rsi14[recentLowIndex]
    ) &&
    Number.isFinite(
      rsi14[previousLowIndex]
    ) &&
    rows[recentLowIndex].low <
      rows[previousLowIndex].low &&
    rsi14[recentLowIndex] >
      rsi14[previousLowIndex] + 2;

  const support =
    finiteMinimum(
      rows
        .slice(-30)
        .map((row) => row.low)
    );

  const supportDistance =
    Number.isFinite(support) &&
    last.close > 0
      ? (
          (last.close - support) /
          last.close
        ) *
        100
      : null;

  const nearSupport =
    Number.isFinite(
      supportDistance
    ) &&
    supportDistance >= 0 &&
    supportDistance <= 4;

  const rsiOversold =
    Number.isFinite(currentRsi) &&
    currentRsi <= 35;

  const rsiRecovering =
    Number.isFinite(currentRsi) &&
    Number.isFinite(previousRsi) &&
    currentRsi > previousRsi &&
    currentRsi <= 50;

  const macdRecovering =
    histogram.length >= 3 &&
    histogram[lastIndex] >
      histogram[lastIndex - 1] &&
    histogram[lastIndex - 1] >=
      histogram[lastIndex - 2];

  const shortTrend =
    ema5[lastIndex] >
    ema9[lastIndex];

  const priceConfirmation =
    last.close >
    previous.high;

  const strongVolume =
    Number.isFinite(volumeRatio) &&
    volumeRatio >= 1.2;

  let score = 0;

  if (nearSupport) score += 15;
  if (rsiOversold) score += 15;
  else if (rsiRecovering) {
    score += 10;
  }

  if (bullishDivergence) {
    score += 20;
  }

  if (macdRecovering) {
    score += 15;
  }

  if (shortTrend) {
    score += 10;
  }

  if (priceConfirmation) {
    score += 15;
  }

  if (strongVolume) {
    score += 10;
  }

  score = Math.min(score, 100);

  const status =
    score >= 80 &&
    priceConfirmation &&
    shortTrend
      ? 'DÖNÜŞ TEYİT EDİLDİ'
      : score >= 65
        ? 'DÖNÜŞ ADAYI'
        : score >= 45
          ? 'DİP ARANIYOR'
          : 'ZAYIF';

  const reasons = [
    nearSupport
      ? 'Önemli desteğe yakın'
      : null,
    rsiOversold
      ? 'RSI aşırı satım bölgesinde'
      : null,
    rsiRecovering
      ? 'RSI yukarı dönüyor'
      : null,
    bullishDivergence
      ? 'RSI pozitif uyumsuzluğu'
      : null,
    macdRecovering
      ? 'MACD momentumu toparlanıyor'
      : null,
    shortTrend
      ? 'EMA5, EMA9 üzerinde'
      : null,
    priceConfirmation
      ? 'Önceki günün tepesi geçildi'
      : null,
    strongVolume
      ? 'Hacim hareketi destekliyor'
      : null,
  ].filter(Boolean);

  const missing = [
    !nearSupport
      ? 'Destek yakınlığı yok'
      : null,
    !bullishDivergence
      ? 'Pozitif uyumsuzluk yok'
      : null,
    !macdRecovering
      ? 'MACD teyidi yok'
      : null,
    !shortTrend
      ? 'Kısa trend dönmedi'
      : null,
    !priceConfirmation
      ? 'Fiyat teyidi bekleniyor'
      : null,
    !strongVolume
      ? 'Hacim 1,20x altında'
      : null,
  ].filter(Boolean);

  const stop =
    Number.isFinite(support)
      ? support * 0.985
      : last.close * 0.96;

  const risk =
    Math.max(
      last.close - stop,
      last.close * 0.01
    );

  const changePercent =
    previous.close > 0
      ? (
          (last.close -
            previous.close) /
          previous.close
        ) *
        100
      : null;

  return {
    symbol,
    status,
    score,
    price: round(last.close),
    changePercent:
      round(changePercent),
    rsi: round(currentRsi),
    volumeRatio:
      round(volumeRatio),
    support: round(support),
    supportDistance:
      round(supportDistance),
    ema5: round(ema5[lastIndex]),
    ema9: round(ema9[lastIndex]),
    ema50:
      round(ema50[lastIndex]),
    ema200:
      round(ema200[lastIndex]),
    bullishDivergence,
    macdRecovering,
    shortTrend,
    priceConfirmation,
    strongVolume,
    confirmationPrice:
      round(previous.high),
    stop: round(stop),
    target1:
      round(last.close + risk * 2),
    target2:
      round(last.close + risk * 3),
    reasons,
    missing,
    dataTime:
      new Date(
        last.time * 1000
      ).toISOString(),
  };
}

async function mapWithConcurrency(
  items,
  limit,
  mapper
) {
  const results =
    new Array(items.length);

  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;

      try {
        results[index] =
          await mapper(items[index]);
      } catch (error) {
        console.warn(
          'Dönüş tarama hatası:',
          error?.message || error
        );

        results[index] = null;
      }
    }
  }

  await Promise.all(
    Array.from(
      {
        length: Math.min(
          limit,
          items.length
        ),
      },
      () => worker()
    )
  );

  return results;
}

export async function GET() {
  try {
    if (
      memoryCache.payload &&
      memoryCache.expiresAt >
        Date.now()
    ) {
      return NextResponse.json(
        memoryCache.payload
      );
    }

    const analyses =
      await mapWithConcurrency(
        BIST_SYMBOLS,
        6,
        async (symbol) => {
          const rows =
            await fetchRows(symbol);

          return analyze(
            symbol,
            rows
          );
        }
      );

    const items = analyses
      .filter(Boolean)
      .sort(
        (first, second) =>
          second.score -
          first.score
      );

    const payload = {
      ok: true,
      version:
        'bist-reversal-v1',
      scanned:
        BIST_SYMBOLS.length,
      analyzed: items.length,
      generatedAt:
        new Date().toISOString(),
      summary: {
        confirmed:
          items.filter(
            (item) =>
              item.status ===
              'DÖNÜŞ TEYİT EDİLDİ'
          ).length,
        candidates:
          items.filter(
            (item) =>
              item.status ===
              'DÖNÜŞ ADAYI'
          ).length,
        watching:
          items.filter(
            (item) =>
              item.status ===
              'DİP ARANIYOR'
          ).length,
      },
      items,
    };

    memoryCache = {
      expiresAt:
        Date.now() + CACHE_TTL,
      payload,
    };

    return NextResponse.json(
      payload
    );
  } catch (error) {
    console.error(
      'BIST dönüş radarı hatası:',
      error
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          error?.message ||
          'Dönüş radarı çalıştırılamadı.',
      },
      {
        status: 500,
      }
    );
  }
}
