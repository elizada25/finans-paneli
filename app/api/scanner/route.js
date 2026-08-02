import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/*
  Dinamik BIST 100 listesi alınamazsa kullanılacak yedek liste.
  Liste ayrı tutulduğu için dönemsel endeks değişimlerinde kolayca
  güncellenebilir.
*/
const BIST100_FALLBACK = [
  'AEFES', 'AGHOL', 'AKBNK', 'AKSA', 'AKSEN',
  'ALARK', 'ALFAS', 'ARCLK', 'ASELS', 'ASTOR',
  'BIMAS', 'BRSAN', 'BRYAT', 'BTCIM', 'CANTE',
  'CCOLA', 'CIMSA', 'CWENE', 'DOAS', 'DSTKF',
  'ECILC', 'EFORC', 'EGEEN', 'EKGYO', 'ENERY',
  'ENJSA', 'ENKAI', 'EREGL', 'EUPWR', 'FROTO',
  'GARAN', 'GESAN', 'GOLTS', 'GRTHO', 'GSRAY',
  'GUBRF', 'HALKB', 'HEKTS', 'IEYHO', 'ISCTR',
  'ISGYO', 'ISMEN', 'KARSN', 'KCAER', 'KCHOL',
  'KMPUR', 'KONTR', 'KOZAA', 'KOZAL', 'KRDMD',
  'KTLEV', 'MAGEN', 'MGROS', 'MIATK', 'MPARK',
  'ODAS', 'OTKAR', 'OYAKC', 'PASEU', 'PETKM',
  'PGSUS', 'RALYH', 'REEDR', 'SAHOL', 'SASA',
  'SISE', 'SKBNK', 'SMRTG', 'SOKM', 'TABGD',
  'TAVHL', 'TCELL', 'THYAO', 'TKFEN', 'TMSN',
  'TOASO', 'TSKB', 'TTKOM', 'TTRAK', 'TUKAS',
  'TUPRS', 'TURSG', 'ULKER', 'VAKBN', 'VESTL',
  'YEOTK', 'YKBNK', 'ZOREN', 'AKFGY', 'ANSGR',
  'ARDYZ', 'BERA', 'BIENY', 'BIZIM', 'CLEBI',
  'DEVA', 'DOHOL', 'GLRMK', 'KLRHO', 'OBAMS'
];

function uniqueSymbols(values) {
  return [
    ...new Set(
      values
        .map((value) =>
          String(value || '')
            .trim()
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, '')
        )
        .filter(
          (value) =>
            value.length >= 3 &&
            value.length <= 8 &&
            value !== 'XU100'
        )
    ),
  ];
}

async function fetchBist100Symbols() {
  const found = [];

  const sources = [
    'https://www.tradingview.com/symbols/BIST-XU100/components/',
    'https://www.borsaistanbul.com/en/index/xu100',
  ];

  for (const url of sources) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 Sky-Finans-Scanner/1.0',
          Accept: 'text/html,application/xhtml+xml',
        },
        next: {
          revalidate: 21600,
        },
      });

      if (!response.ok) {
        continue;
      }

      const html = await response.text();

      const patterns = [
        /BIST:([A-Z0-9]{3,8})/g,
        /symbol-BIST-([A-Z0-9]{3,8})/g,
        /"s":"BIST:([A-Z0-9]{3,8})"/g,
        /\b([A-Z0-9]{3,8})\.E\b/g,
      ];

      for (const pattern of patterns) {
        let match;

        while ((match = pattern.exec(html))) {
          found.push(match[1]);
        }
      }
    } catch (error) {
      console.error(
        'BIST 100 liste kaynağı hatası:',
        error?.message || error
      );
    }
  }

  const dynamicSymbols = uniqueSymbols(found);

  if (dynamicSymbols.length >= 80) {
    return {
      symbols: dynamicSymbols.slice(0, 100),
      source: 'dynamic',
    };
  }

  return {
    symbols: uniqueSymbols(BIST100_FALLBACK).slice(0, 100),
    source: 'fallback',
  };
}

function calculateEma(values, period) {
  if (
    !Array.isArray(values) ||
    values.length < period
  ) {
    return [];
  }

  const multiplier = 2 / (period + 1);

  let previous =
    values
      .slice(0, period)
      .reduce((total, value) => total + value, 0) /
    period;

  const result = new Array(period - 1).fill(null);
  result.push(previous);

  for (let index = period; index < values.length; index += 1) {
    const current =
      (values[index] - previous) * multiplier +
      previous;

    result.push(current);
    previous = current;
  }

  return result;
}

function parseChartResponse(data, symbol) {
  const result =
    data?.chart?.result?.[0];

  if (!result) {
    return null;
  }

  const timestamps = result.timestamp || [];

  const quote =
    result.indicators?.quote?.[0] || {};

  const closes = quote.close || [];
  const volumes = quote.volume || [];

  const rows = [];

  for (let index = 0; index < closes.length; index += 1) {
    const close = Number(closes[index]);

    if (!Number.isFinite(close)) {
      continue;
    }

    rows.push({
      timestamp: Number(timestamps[index]),
      close,
      volume:
        Number.isFinite(Number(volumes[index]))
          ? Number(volumes[index])
          : null,
    });
  }

  if (rows.length < 30) {
    return null;
  }

  return {
    symbol,
    rows,
  };
}

async function fetchHistory(symbol) {
  const yahooSymbol =
    `${encodeURIComponent(symbol)}.IS`;

  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/` +
    `${yahooSymbol}?interval=1d&range=2y&events=history`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 Sky-Finans-Scanner/1.0',
        Accept: 'application/json',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(12000),
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    return parseChartResponse(data, symbol);
  } catch (error) {
    console.error(
      `${symbol} geçmiş veri hatası:`,
      error?.message || error
    );

    return null;
  }
}

function getVolumeRatio(rows) {
  const usable = rows
    .filter(
      (row) =>
        Number.isFinite(row.volume) &&
        row.volume > 0
    )
    .slice(-21);

  if (usable.length < 10) {
    return null;
  }

  const currentVolume =
    usable[usable.length - 1].volume;

  const previousVolumes =
    usable
      .slice(0, -1)
      .map((row) => row.volume);

  const average =
    previousVolumes.reduce(
      (total, value) => total + value,
      0
    ) / previousVolumes.length;

  if (!average) {
    return null;
  }

  return currentVolume / average;
}

function findCross({ history, fastPeriod, slowPeriod, direction }) {
  const rows = (history.rows || [])
    .filter((row) =>
      Number.isFinite(Number(row.close)) &&
      Number.isFinite(Number(row.timestamp))
    )
    .sort((a, b) => Number(a.timestamp) - Number(b.timestamp));

  if (direction !== "up" && direction !== "down") {
    return null;
  }

  const closes = rows.map((row) => Number(row.close));
  const minimumBars = Math.max(fastPeriod, slowPeriod) + 10;

  if (closes.length < minimumBars) {
    return null;
  }

  /*
   * Yahoo bazen güncel işlem gününe ait tamamlanmamış
   * günlük mumu döndürebilir.
   *
   * Scanner sadece TAMAMLANMIŞ günlük mumları kullanır.
   *
   * BIST için Türkiye saatiyle gün kapanışı sonrası oluşan
   * günlük mum esas alınır. Hafta sonu veya piyasa kapalıysa
   * zaten son kapanmış mum kullanılır.
   *
   * Güvenlik amacıyla gelecekteki/zamanı hatalı kayıtları temizle.
   */
  const now = Math.floor(Date.now() / 1000);

  const validRows = rows.filter(
    (row) => Number(row.timestamp) <= now
  );

  if (validRows.length < minimumBars) {
    return null;
  }

  const completedRows = validRows;

  const completedCloses = completedRows.map(
    (row) => Number(row.close)
  );

  const fastEma = calculateEma(
    completedCloses,
    fastPeriod
  );

  const slowEma = calculateEma(
    completedCloses,
    slowPeriod
  );

  const lastIndex = completedRows.length - 1;
  const previousIndex = lastIndex - 1;

  if (previousIndex < 0) {
    return null;
  }

  const fastPrevious = fastEma[previousIndex];
  const slowPrevious = slowEma[previousIndex];

  const fastCurrent = fastEma[lastIndex];
  const slowCurrent = slowEma[lastIndex];

  if (
    !Number.isFinite(fastPrevious) ||
    !Number.isFinite(slowPrevious) ||
    !Number.isFinite(fastCurrent) ||
    !Number.isFinite(slowCurrent)
  ) {
    return null;
  }

  /*
   * GERÇEK YUKARI KESİŞİM:
   *
   * Önceki tamamlanmış mumda:
   * EMA5 <= EMA22
   *
   * Son tamamlanmış mumda:
   * EMA5 > EMA22
   */
  const isRealUpCross =
    fastPrevious <= slowPrevious &&
    fastCurrent > slowCurrent;

  /*
   * GERÇEK AŞAĞI KESİŞİM:
   *
   * Önceki tamamlanmış mumda:
   * EMA5 >= EMA22
   *
   * Son tamamlanmış mumda:
   * EMA5 < EMA22
   */
  const isRealDownCross =
    fastPrevious >= slowPrevious &&
    fastCurrent < slowCurrent;

  /*
   * YUKARI tarama sadece yukarı kesişimi kabul eder.
   * AŞAĞI tarama sadece aşağı kesişimi kabul eder.
   *
   * Böylece aynı mum aynı anda iki yönde sinyal üretemez.
   */
  if (direction === "up" && !isRealUpCross) {
    return null;
  }

  if (direction === "down" && !isRealDownCross) {
    return null;
  }

  const latestRow = completedRows[lastIndex];
  const previousRow = completedRows[previousIndex];

  const currentClose = Number(latestRow.close);
  const previousClose = Number(previousRow.close);

  if (
    !Number.isFinite(currentClose) ||
    !Number.isFinite(previousClose)
  ) {
    return null;
  }

  const dailyChange =
    previousClose !== 0
      ? ((currentClose - previousClose) / previousClose) * 100
      : null;

  const volumeRatio = getVolumeRatio(completedRows);

  return {
    symbol: history.symbol,
    price: currentClose,
    dailyChange,
    fastEma: fastCurrent,
    slowEma: slowCurrent,
    differencePercent:
      slowCurrent !== 0
        ? ((fastCurrent - slowCurrent) / slowCurrent) * 100
        : null,
    volumeRatio,
    barsSinceCross: 0,
    signalDate: new Date(
      Number(latestRow.timestamp) * 1000
    ).toISOString(),
    direction
  };
}
async function mapWithConcurrency(
  values,
  concurrency,
  worker
) {
  const results = [];
  let currentIndex = 0;

  async function runWorker() {
    while (currentIndex < values.length) {
      const index = currentIndex;
      currentIndex += 1;

      try {
        const result =
          await worker(values[index], index);

        results[index] = result;
      } catch (error) {
        results[index] = null;
      }
    }
  }

  const workers = Array.from(
    {
      length: Math.min(
        concurrency,
        values.length
      ),
    },
    () => runWorker()
  );

  await Promise.all(workers);

  return results;
}

function readNumber(value, fallback) {
  const number = Number(value);

  if (!Number.isInteger(number)) {
    return fallback;
  }

  if (number < 2 || number > 250) {
    return fallback;
  }

  return number;
}

export async function GET(request) {
  try {
    const url = new URL(request.url);

    const fastPeriod =
      readNumber(
        url.searchParams.get('fast'),
        5
      );

    const slowPeriod =
      readNumber(
        url.searchParams.get('slow'),
        22
      );

    const direction =
      url.searchParams.get('direction') ===
      'down'
        ? 'down'
        : 'up';

    if (fastPeriod >= slowPeriod) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Hızlı EMA, yavaş EMA değerinden küçük olmalıdır.',
        },
        {
          status: 400,
        }
      );
    }

    const universe =
      await fetchBist100Symbols();

    const histories =
      await mapWithConcurrency(
        universe.symbols,
        10,
        fetchHistory
      );

    const validHistories =
      histories.filter(Boolean);

    const results =
      validHistories
        .map((history) =>
          findCross({
            history,
            fastPeriod,
            slowPeriod,
            direction,
          })
        )
        .filter(Boolean)
        .sort((a, b) => {
          const volumeA =
            Number(a.volumeRatio) || 0;

          const volumeB =
            Number(b.volumeRatio) || 0;

          return volumeB - volumeA;
        });

    return NextResponse.json({
      ok: true,
      universe: 'BIST 100',
      timeframe: '1D',
      listSource: universe.source,
      fastPeriod,
      slowPeriod,
      direction,
      scanned: universe.symbols.length,
      dataAvailable: validHistories.length,
      resultCount: results.length,
      strongSignalCount: results.filter((item) => item.signalStrength === 'strong').length,
      results,
      scannedAt:
        new Date().toISOString(),
    });
  } catch (error) {
    console.error(
      'Tarama merkezi hatası:',
      error
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          error?.message ||
          'Tarama işlemi tamamlanamadı.',
      },
      {
        status: 500,
      }
    );
  }
}
