import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const CACHE_TTL = 6 * 60 * 60 * 1000;
const cache = new Map();

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
  'DEVA', 'DOHOL', 'GLRMK', 'KLRHO', 'OBAMS',
];

const MONTH_NAMES = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];

function round(value, digits = 2) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const factor = 10 ** digits;
  return Math.round(number * factor) / factor;
}

function average(values) {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function median(values) {
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);

  if (ordered.length % 2) return ordered[middle];
  return (ordered[middle - 1] + ordered[middle]) / 2;
}

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

  const pages = await Promise.all(
    sources.map(async (url) => {
      try {
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 Sky-Finans-Seasonality/1.0',
            Accept: 'text/html,application/xhtml+xml',
          },
          next: { revalidate: 21600 },
          signal: AbortSignal.timeout(10000),
        });

        return response.ok ? await response.text() : '';
      } catch (error) {
        console.error(
          'BIST 100 mevsimsellik liste hatası:',
          error?.message || error
        );
        return '';
      }
    })
  );

  for (const html of pages) {
    if (!html) continue;

      const patterns = [
        /BIST:([A-Z0-9]{3,8})/g,
        /symbol-BIST-([A-Z0-9]{3,8})/g,
        /"s":"BIST:([A-Z0-9]{3,8})"/g,
        /\b([A-Z0-9]{3,8})\.E\b/g,
      ];

      for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(html))) found.push(match[1]);
      }
  }

  const dynamicSymbols = uniqueSymbols(found);

  if (dynamicSymbols.length >= 80) {
    return { symbols: dynamicSymbols.slice(0, 100), source: 'dynamic' };
  }

  return {
    symbols: uniqueSymbols(BIST100_FALLBACK).slice(0, 100),
    source: 'fallback',
  };
}

function completedYears(month, now = new Date()) {
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth() + 1;
  const lastCompletedYear = month < currentMonth
    ? currentYear
    : currentYear - 1;

  return Array.from(
    { length: 5 },
    (_, index) => lastCompletedYear - 4 + index
  );
}

async function fetchMonthlyRows(symbol, firstYear) {
  const yahooSymbol = `${symbol}.IS`;
  const period1 = Math.floor(Date.UTC(firstYear - 1, 10, 1) / 1000);
  const period2 = Math.floor(Date.now() / 1000) + 86400;
  const query =
    `period1=${period1}&period2=${period2}` +
    '&interval=1mo&events=history&includeAdjustedClose=true';
  const hosts = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];

  for (const host of hosts) {
    try {
      const response = await fetch(
        `https://${host}/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?${query}`,
        {
          cache: 'no-store',
          headers: {
            Accept: 'application/json',
            'User-Agent': 'Mozilla/5.0 Sky-Finans-Seasonality/1.0',
          },
          signal: AbortSignal.timeout(10000),
        }
      );

      if (!response.ok) continue;

      const result = (await response.json())?.chart?.result?.[0];
      if (!result) continue;

      const timestamps = result.timestamp || [];
      const quote = result.indicators?.quote?.[0] || {};
      const adjusted = result.indicators?.adjclose?.[0]?.adjclose || [];

      return timestamps
        .map((timestamp, index) => {
          const date = new Date(Number(timestamp) * 1000);
          const close = Number(adjusted[index] ?? quote.close?.[index]);

          return {
            year: date.getUTCFullYear(),
            month: date.getUTCMonth() + 1,
            close,
          };
        })
        .filter((row) => Number.isFinite(row.close) && row.close > 0)
        .sort((a, b) =>
          a.year !== b.year ? a.year - b.year : a.month - b.month
        );
    } catch (error) {
      console.error(`${symbol} aylık veri hatası:`, error?.message || error);
    }
  }

  return [];
}

function previousYearMonth(year, month) {
  return month === 1
    ? { year: year - 1, month: 12 }
    : { year, month: month - 1 };
}

function analyzeSymbol(symbol, rows, month, years) {
  const yearlyReturns = [];

  for (const year of years) {
    const currentIndex = rows.findIndex(
      (row) => row.year === year && row.month === month
    );

    if (currentIndex < 1) return null;

    const current = rows[currentIndex];
    const previous = rows[currentIndex - 1];
    const expectedPrevious = previousYearMonth(year, month);

    if (
      previous.year !== expectedPrevious.year ||
      previous.month !== expectedPrevious.month
    ) {
      return null;
    }

    const returnPercent = ((current.close / previous.close) - 1) * 100;
    if (!Number.isFinite(returnPercent)) return null;

    yearlyReturns.push({
      year,
      returnPercent: round(returnPercent),
      positive: returnPercent > 0,
    });
  }

  if (yearlyReturns.length !== 5) return null;

  const values = yearlyReturns.map((item) => item.returnPercent);
  const winCount = yearlyReturns.filter((item) => item.positive).length;

  return {
    symbol,
    winCount,
    sampleCount: 5,
    consistency: `${winCount}/5`,
    averageReturn: round(average(values)),
    medianReturn: round(median(values)),
    bestReturn: round(Math.max(...values)),
    worstReturn: round(Math.min(...values)),
    negativeYears: yearlyReturns
      .filter((item) => !item.positive)
      .map((item) => ({
        year: item.year,
        returnPercent: item.returnPercent,
      })),
    years: yearlyReturns,
  };
}

async function mapWithConcurrency(values, concurrency, worker) {
  const results = new Array(values.length);
  let cursor = 0;

  async function runWorker() {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;

      try {
        results[index] = await worker(values[index]);
      } catch {
        results[index] = null;
      }
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, values.length) },
      () => runWorker()
    )
  );

  return results;
}

export async function GET(request) {
  try {
    const month = Number(
      new URL(request.url).searchParams.get('month')
    );

    if (!Number.isInteger(month) || month < 1 || month > 12) {
      return NextResponse.json(
        { ok: false, error: 'Ay 1 ile 12 arasında olmalıdır.' },
        { status: 400 }
      );
    }

    const cached = cache.get(month);
    if (cached && cached.expiresAt > Date.now()) {
      return NextResponse.json(cached.payload);
    }

    const years = completedYears(month);
    const universe = await fetchBist100Symbols();
    const analyses = await mapWithConcurrency(
      universe.symbols,
      10,
      async (symbol) => {
        const rows = await fetchMonthlyRows(symbol, years[0]);
        return analyzeSymbol(symbol, rows, month, years);
      }
    );

    const valid = analyses.filter(Boolean);
    const items = valid
      .filter((item) => item.winCount >= 4)
      .sort(
        (first, second) =>
          second.winCount - first.winCount ||
          second.averageReturn - first.averageReturn ||
          second.medianReturn - first.medianReturn ||
          first.symbol.localeCompare(second.symbol)
      );

    const payload = {
      ok: true,
      version: 'bist-seasonality-v1',
      month,
      monthName: MONTH_NAMES[month - 1],
      years,
      generatedAt: new Date().toISOString(),
      universeSource: universe.source,
      scanned: universe.symbols.length,
      completeHistory: valid.length,
      insufficientHistory: universe.symbols.length - valid.length,
      perfectCount: items.filter((item) => item.winCount === 5).length,
      fourOfFiveCount: items.filter((item) => item.winCount === 4).length,
      items,
    };

    cache.set(month, {
      expiresAt: Date.now() + CACHE_TTL,
      payload,
    });

    return NextResponse.json(payload);
  } catch (error) {
    console.error('BIST mevsimsellik tarama hatası:', error);

    return NextResponse.json(
      {
        ok: false,
        error: error?.message || 'Mevsimsellik taraması tamamlanamadı.',
      },
      { status: 500 }
    );
  }
}
