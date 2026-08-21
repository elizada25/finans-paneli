import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 30;

const MARKETS = [
  {
    id: 'cac',
    group: 'Avrupa',
    name: 'CAC 40',
    country: 'Fransa',
    symbol: '^FCHI',
    investingUrl:
      'https://tr.investing.com/indices/france-40',
  },
  {
    id: 'dax',
    group: 'Avrupa',
    name: 'DAX',
    country: 'Almanya',
    symbol: '^GDAXI',
    investingUrl:
      'https://tr.investing.com/indices/germany-30',
  },
  {
    id: 'ftse',
    group: 'Avrupa',
    name: 'FTSE 100',
    country: 'İngiltere',
    symbol: '^FTSE',
    investingUrl:
      'https://tr.investing.com/indices/uk-100',
  },
  {
    id: 'stoxx',
    group: 'Avrupa',
    name: 'Euro Stoxx 50',
    country: 'Euro Bölgesi',
    symbol: '^STOXX50E',
    investingUrl:
      'https://tr.investing.com/indices/eu-stoxx50',
  },
  {
    id: 'kospi',
    group: 'Asya',
    name: 'KOSPI',
    country: 'Güney Kore',
    symbol: '^KS11',
    investingUrl:
      'https://tr.investing.com/indices/kospi',
  },
  {
    id: 'nikkei',
    group: 'Asya',
    name: 'Nikkei 225',
    country: 'Japonya',
    symbol: '^N225',
    investingUrl:
      'https://tr.investing.com/indices/japan-ni225',
  },
  {
    id: 'shanghai',
    group: 'Asya',
    name: 'Shanghai',
    country: 'Çin',
    symbol: '000001.SS',
    investingUrl:
      'https://tr.investing.com/indices/shanghai-composite',
  },
  {
    id: 'hangseng',
    group: 'Asya',
    name: 'Hang Seng',
    country: 'Hong Kong',
    symbol: '^HSI',
    investingUrl:
      'https://tr.investing.com/indices/hang-sen-40',
  },
  {
    id: 'sp500-future',
    group: 'ABD Vadeli',
    name: 'S&P 500 Vadeli',
    country: 'ABD',
    symbol: 'ES=F',
    investingUrl:
      'https://tr.investing.com/indices/us-spx-500-futures',
  },
  {
    id: 'nasdaq-future',
    group: 'ABD Vadeli',
    name: 'Nasdaq 100 Vadeli',
    country: 'ABD',
    symbol: 'NQ=F',
    investingUrl:
      'https://tr.investing.com/indices/nq-100-futures',
  },
  {
    id: 'dow-future',
    group: 'ABD Vadeli',
    name: 'Dow Vadeli',
    country: 'ABD',
    symbol: 'YM=F',
    investingUrl:
      'https://tr.investing.com/indices/us-30-futures',
  },
  {
    id: 'russell-future',
    group: 'ABD Vadeli',
    name: 'Russell 2000 Vadeli',
    country: 'ABD',
    symbol: 'RTY=F',
    investingUrl:
      'https://tr.investing.com/indices/indices-futures',
  },
];

function numberValue(...values) {
  for (const value of values) {
    const parsed = Number(value);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function lastFinite(values) {
  if (!Array.isArray(values)) return null;

  for (let index = values.length - 1; index >= 0; index -= 1) {
    const value = Number(values[index]);

    if (Number.isFinite(value)) {
      return value;
    }
  }

  return null;
}

async function fetchMarket(item) {
  const url =
    'https://query1.finance.yahoo.com/v8/finance/chart/' +
    `${encodeURIComponent(item.symbol)}` +
    '?interval=5m&range=5d&includePrePost=true&events=history';

  const response = await fetch(url, {
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      'User-Agent':
        'Mozilla/5.0 Sky-Finans-Global-Markets/1.0',
    },
    signal: AbortSignal.timeout(12000),
  });

  if (!response.ok) {
    throw new Error(
      `${item.name} veri servisi ${response.status} hatası verdi.`
    );
  }

  const payload = await response.json();
  const result = payload?.chart?.result?.[0];

  if (!result) {
    throw new Error(`${item.name} verisi bulunamadı.`);
  }

  const meta = result.meta || {};
  const quote =
    result.indicators?.quote?.[0] || {};

  const price = numberValue(
    meta.regularMarketPrice,
    lastFinite(quote.close)
  );

  const previousClose = numberValue(
    meta.chartPreviousClose,
    meta.previousClose,
    meta.regularMarketPreviousClose
  );

  const change =
    Number.isFinite(price) &&
    Number.isFinite(previousClose)
      ? price - previousClose
      : null;

  const changePercent =
    Number.isFinite(change) &&
    previousClose !== 0
      ? (change / previousClose) * 100
      : null;

  const lastTimestamp =
    Array.isArray(result.timestamp) &&
    result.timestamp.length
      ? result.timestamp[result.timestamp.length - 1]
      : null;

  return {
    ...item,
    price,
    previousClose,
    change,
    changePercent,
    dayHigh: numberValue(
      meta.regularMarketDayHigh,
      lastFinite(quote.high)
    ),
    dayLow: numberValue(
      meta.regularMarketDayLow,
      lastFinite(quote.low)
    ),
    marketState:
      String(meta.marketState || '').toUpperCase(),
    exchange:
      meta.fullExchangeName ||
      meta.exchangeName ||
      '',
    currency: meta.currency || '',
    dataTime:
      Number.isFinite(Number(lastTimestamp))
        ? new Date(
            Number(lastTimestamp) * 1000
          ).toISOString()
        : null,
  };
}

export async function GET() {
  try {
    const results = await Promise.allSettled(
      MARKETS.map(fetchMarket)
    );

    const items = results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return {
          ok: true,
          ...result.value,
        };
      }

      return {
        ok: false,
        ...MARKETS[index],
        error:
          result.reason?.message ||
          'Veri alınamadı.',
      };
    });

    return NextResponse.json({
      ok: true,
      items,
      generatedAt: new Date().toISOString(),
      source:
        'Yakın zamanlı piyasa akışı',
      delayNote:
        'Veriler borsaya ve ürüne göre gecikmeli olabilir.',
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        items: [],
        error:
          error?.message ||
          'Dünya piyasaları alınamadı.',
      },
      { status: 500 }
    );
  }
}
