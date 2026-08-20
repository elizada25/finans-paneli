import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const INTERVALS = {
  '5m': { yahoo: '5m', range: '5d' },
  '15m': { yahoo: '15m', range: '1mo' },
  '60m': { yahoo: '60m', range: '3mo' },
  '1d': { yahoo: '1d', range: '2y' },
};

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);

    const symbol = String(
      searchParams.get('symbol') || ''
    )
      .trim()
      .toUpperCase();

    const market =
      String(
        searchParams.get('market') || 'us'
      ).toLowerCase() === 'bist'
        ? 'bist'
        : 'us';

    const interval =
      String(
        searchParams.get('interval') || '1d'
      ).toLowerCase();

    if (
      !symbol ||
      !/^[A-Z0-9.-]{1,15}$/.test(symbol)
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Geçerli bir hisse kodu yazın.',
        },
        { status: 400 }
      );
    }

    const intervalConfig =
      INTERVALS[interval];

    if (!intervalConfig) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Geçersiz grafik aralığı.',
        },
        { status: 400 }
      );
    }

    const yahooSymbol =
      market === 'bist'
        ? `${symbol}.IS`
        : symbol;

    const query = new URLSearchParams({
      interval: intervalConfig.yahoo,
      range: intervalConfig.range,
      events: 'history',
      includePrePost:
        market === 'us' ? 'true' : 'false',
    });

    const urls = [
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
        yahooSymbol
      )}?${query}`,
      `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
        yahooSymbol
      )}?${query}`,
    ];

    let payload = null;
    let lastStatus = null;

    for (const url of urls) {
      const response = await fetch(url, {
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
          'User-Agent':
            'Mozilla/5.0 Sky-Finans-Chart/1.0',
        },
        signal: AbortSignal.timeout(12000),
      });

      lastStatus = response.status;

      if (response.ok) {
        payload = await response.json();
        break;
      }
    }

    if (!payload) {
      throw new Error(
        `Grafik veri servisi ${lastStatus || ''} hatası verdi.`
      );
    }

    const result =
      payload?.chart?.result?.[0];

    if (!result) {
      throw new Error(
        `${symbol} için grafik verisi bulunamadı.`
      );
    }

    const timestamps =
      result.timestamp || [];

    const quote =
      result.indicators?.quote?.[0] || {};

    const rows = timestamps
      .map((timestamp, index) => ({
        time: Number(timestamp),
        open: Number(quote.open?.[index]),
        high: Number(quote.high?.[index]),
        low: Number(quote.low?.[index]),
        close: Number(quote.close?.[index]),
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
          Number.isFinite(row.close) &&
          row.open > 0 &&
          row.high > 0 &&
          row.low > 0 &&
          row.close > 0
      )
      .sort((a, b) => a.time - b.time);

    const uniqueRows = [];
    const seen = new Set();

    for (const row of rows) {
      if (seen.has(row.time)) continue;
      seen.add(row.time);
      uniqueRows.push(row);
    }

    return NextResponse.json(
      {
        ok: true,
        symbol,
        market,
        interval,
        count: uniqueRows.length,
        rows: uniqueRows,
        currency:
          result.meta?.currency ||
          (market === 'bist' ? 'TRY' : 'USD'),
        exchange:
          result.meta?.exchangeName || null,
        generatedAt: new Date().toISOString(),
        delayed: true,
      },
      {
        headers: {
          'Cache-Control':
            'no-store, max-age=0',
        },
      }
    );
  } catch (error) {
    console.error(
      'Özel grafik veri hatası:',
      error
    );

    return NextResponse.json(
      {
        ok: false,
        rows: [],
        error:
          error?.message ||
          'Grafik verileri alınamadı.',
      },
      { status: 500 }
    );
  }
}
