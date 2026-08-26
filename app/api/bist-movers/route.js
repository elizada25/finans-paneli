import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const CACHE_TTL = 60 * 1000;
let cache = { expiresAt: 0, payload: null };

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function scan(sortOrder) {
  const response = await fetch(
    'https://scanner.tradingview.com/turkey/scan',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0',
      },
      cache: 'no-store',
      body: JSON.stringify({
        filter: [
          { left: 'type', operation: 'equal', right: 'stock' },
          { left: 'close', operation: 'greater', right: 0 },
          { left: 'volume', operation: 'greater', right: 0 },
        ],
        options: { lang: 'tr' },
        markets: ['turkey'],
        symbols: { query: { types: [] }, tickers: [] },
        columns: ['name', 'close', 'change', 'low', 'high', 'volume'],
        sort: { sortBy: 'change', sortOrder },
        range: [0, 9],
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`BIST tarama servisi HTTP ${response.status}`);
  }

  const payload = await response.json();

  return (payload?.data || []).map((row) => {
    const values = row.d || [];
    return {
      symbol: String(values[0] || row.s || '').replace('BIST:', ''),
      price: number(values[1]),
      changePercent: number(values[2]),
      dayLow: number(values[3]),
      dayHigh: number(values[4]),
      volume: number(values[5]),
    };
  }).filter((item) => item.symbol && item.price !== null);
}

export async function GET() {
  try {
    if (cache.payload && cache.expiresAt > Date.now()) {
      return NextResponse.json(cache.payload);
    }

    const [gainers, losers] = await Promise.all([
      scan('desc'),
      scan('asc'),
    ]);

    const payload = {
      ok: true,
      delayed: true,
      generatedAt: new Date().toISOString(),
      gainers,
      losers,
    };

    cache = { expiresAt: Date.now() + CACHE_TTL, payload };
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error?.message || 'BIST yükselen/düşen listesi alınamadı.' },
      { status: 500 }
    );
  }
}
