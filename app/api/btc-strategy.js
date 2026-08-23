
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

function rsi(values, period = 14) {
  const output = new Array(values.length).fill(null);

  if (values.length <= period) return output;

  let gain = 0;
  let loss = 0;

  for (let index = 1; index <= period; index += 1) {
    const change = values[index] - values[index - 1];
    gain += Math.max(change, 0);
    loss += Math.max(-change, 0);
  }

  let averageGain = gain / period;
  let averageLoss = loss / period;

  output[period] =
    averageLoss === 0
      ? 100
      : 100 - 100 / (1 + averageGain / averageLoss);

  for (let index = period + 1; index < values.length; index += 1) {
    const change = values[index] - values[index - 1];

    averageGain =
      (averageGain * (period - 1) + Math.max(change, 0)) /
      period;

    averageLoss =
      (averageLoss * (period - 1) + Math.max(-change, 0)) /
      period;

    output[index] =
      averageLoss === 0
        ? 100
        : 100 - 100 / (1 + averageGain / averageLoss);
  }

  return output;
}

function atr(rows, period = 14) {
  const ranges = rows.map((row, index) => {
    if (index === 0) return row.high - row.low;

    const previousClose = rows[index - 1].close;

    return Math.max(
      row.high - row.low,
      Math.abs(row.high - previousClose),
      Math.abs(row.low - previousClose)
    );
  });

  return ema(ranges, period);
}

function average(values) {
  if (!values.length) return 0;

  return values.reduce(
    (total, value) => total + value,
    0
  ) / values.length;
}

function round(value, digits = 2) {
  if (!Number.isFinite(value)) return null;

  return Number(value.toFixed(digits));
}

async function fetchRows(interval, limit = 500) {
  const query = new URLSearchParams({
    symbol: "BTCUSDT",
    interval,
    limit: String(limit),
  });

  const endpoints = [
    `https://api.binance.com/api/v3/klines?${query}`,
    `https://api1.binance.com/api/v3/klines?${query}`,
    `https://api2.binance.com/api/v3/klines?${query}`,
  ];

  let lastError = null;

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "User-Agent": "Sky-Finans-BTC-Radar/1.0",
        },
        signal: AbortSignal.timeout(12000),
      });

      if (!response.ok) {
        lastError = new Error(`Binance HTTP ${response.status}`);
        continue;
      }

      const payload = await response.json();
      const now = Date.now();

      return payload
        .map((item) => ({
          time: Number(item[0]),
          closeTime: Number(item[6]),
          open: Number(item[1]),
          high: Number(item[2]),
          low: Number(item[3]),
          close: Number(item[4]),
          volume: Number(item[5]),
        }))
        .filter(
          (row) =>
            row.closeTime < now &&
            Number.isFinite(row.close)
        );
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("BTC verisi alınamadı.");
}

function analyzeRows(rows) {
  const closes = rows.map((row) => row.close);
  const volumes = rows.map((row) => row.volume);

  const ema22 = ema(closes, 22);
  const ema50 = ema(closes, 50);
  const ema200 = ema(closes, 200);
  const rsi14 = rsi(closes, 14);
  const atr14 = atr(rows, 14);

  const index = rows.length - 1;
  const last = rows[index];
  const previous = rows[index - 1];

  const recentAverageVolume = average(
    volumes.slice(-21, -1)
  );

  const volumeRatio =
    recentAverageVolume > 0
      ? last.volume / recentAverageVolume
      : 0;

  return {
    last,
    previous,
    ema22: ema22[index],
    ema50: ema50[index],
    ema200: ema200[index],
    rsi: rsi14[index],
    atr: atr14[index],
    volumeRatio,
  };
}

export async function analyzeBtc() {
  const [hourRows, fourHourRows] =
    await Promise.all([
      fetchRows("1h"),
      fetchRows("4h"),
    ]);

  const hour = analyzeRows(hourRows);
  const fourHour = analyzeRows(fourHourRows);

  const price = hour.last.close;

  const fourHourTrend =
    fourHour.last.close > fourHour.ema200 &&
    fourHour.ema22 > fourHour.ema50;

  const hourTrend =
    price > hour.ema50 &&
    hour.ema22 > hour.ema50;

  const aboveFastAverage =
    price > hour.ema22;

  const rsiHealthy =
    hour.rsi >= 48 &&
    hour.rsi <= 68;

  const volumeHealthy =
    hour.volumeRatio >= 1.1;

  const priceConfirmation =
    price > hour.previous.high;

  let score = 0;

  if (fourHourTrend) score += 30;
  if (hourTrend) score += 20;
  if (aboveFastAverage) score += 15;
  if (rsiHealthy) score += 15;
  if (volumeHealthy) score += 10;
  if (priceConfirmation) score += 10;

  const exitCondition =
    price < hour.ema50 ||
    fourHour.last.close < fourHour.ema50 ||
    hour.rsi < 40;

  const signal =
    exitCondition
      ? "ÇIKIŞ"
      : score >= 70 &&
          fourHourTrend &&
          hourTrend &&
          rsiHealthy
        ? "AL"
        : "BEKLE";

  const riskPerBtc = Math.max(
    hour.atr * 1.5,
    price * 0.01
  );

  const stop = price - riskPerBtc;
  const target1 = price + riskPerBtc * 2;
  const target2 = price + riskPerBtc * 3;

  const reasons = [
    {
      label: "4 saatlik ana trend",
      positive: fourHourTrend,
      text: fourHourTrend
        ? "Fiyat EMA200 üzerinde ve EMA22, EMA50 üzerinde."
        : "Ana trend henüz güçlü yükselişi doğrulamıyor.",
    },
    {
      label: "1 saatlik kısa trend",
      positive: hourTrend,
      text: hourTrend
        ? "EMA22, EMA50 üzerinde."
        : "Kısa vadeli trend yeterince güçlü değil.",
    },
    {
      label: "RSI dengesi",
      positive: rsiHealthy,
      text: `RSI ${round(hour.rsi)} seviyesinde.`,
    },
    {
      label: "Hacim",
      positive: volumeHealthy,
      text: `Hacim ortalamanın ${round(hour.volumeRatio)} katı.`,
    },
    {
      label: "Fiyat teyidi",
      positive: priceConfirmation,
      text: priceConfirmation
        ? "Son kapanış önceki mumun tepesini geçti."
        : "Fiyat teyidi henüz oluşmadı.",
    },
  ];

  return {
    ok: true,
    symbol: "BTCUSDT",
    generatedAt: new Date().toISOString(),
    candleTime:
      new Date(hour.last.time).toISOString(),
    signal,
    score,
    price: round(price),
    ema22: round(hour.ema22),
    ema50: round(hour.ema50),
    ema200: round(hour.ema200),
    rsi: round(hour.rsi),
    atr: round(hour.atr),
    volumeRatio: round(hour.volumeRatio),
    stop: round(stop),
    target1: round(target1),
    target2: round(target2),
    fourHourTrend,
    hourTrend,
    reasons,
    chart: hourRows.slice(-120).map((row) => ({
      time: row.time,
      close: round(row.close),
    })),
  };
}
