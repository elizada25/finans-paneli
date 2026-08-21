import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const INTERVALS = {
  '5m': {
    yahoo: '5m',
    range: '5d',
  },
  '15m': {
    yahoo: '15m',
    range: '1mo',
  },
  '60m': {
    yahoo: '60m',
    range: '3mo',
  },
  '1d': {
    yahoo: '1d',
    range: '10y',
  },
};

export async function GET(request) {
  try {
    const { searchParams } =
      new URL(request.url);

    const symbol = String(
      searchParams.get('symbol') || ''
    )
      .trim()
      .toUpperCase();

    const market =
      searchParams.get('market') === 'us'
        ? 'us'
        : 'bist';

    const interval = String(
      searchParams.get('interval') || '1d'
    ).toLowerCase();

    if (
      !symbol ||
      !/^[A-Z0-9.-]{1,15}$/.test(symbol)
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Geçersiz sembol.',
        },
        { status: 400 }
      );
    }

    const config = INTERVALS[interval];

    if (!config) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Geçersiz zaman aralığı.',
        },
        { status: 400 }
      );
    }

    const yahooSymbol =
      market === 'bist' &&
      !symbol.endsWith('.IS')
        ? `${symbol}.IS`
        : symbol;

    const query = new URLSearchParams({
      interval: config.yahoo,
      range: config.range,
      events: 'history',
      includePrePost:
        market === 'us'
          ? 'true'
          : 'false',
    });

    const hosts = [
      'query1.finance.yahoo.com',
      'query2.finance.yahoo.com',
    ];

    let payload = null;
    let lastStatus = 502;

    for (const host of hosts) {
      const url =
        `https://${host}/v8/finance/chart/` +
        `${encodeURIComponent(yahooSymbol)}?${query}`;

      try {
        const response = await fetch(url, {
          cache: 'no-store',
          headers: {
            Accept: 'application/json',
            'User-Agent':
              'Mozilla/5.0 Sky-Finans-Workspace/1.0',
          },
          signal: AbortSignal.timeout(12000),
        });

        lastStatus = response.status;

        if (!response.ok) continue;

        payload = await response.json();
        break;
      } catch {}
    }

    const result =
      payload?.chart?.result?.[0];

    if (!result) {
      throw new Error(
        `Grafik verisi alınamadı (${lastStatus}).`
      );
    }

    const timestamps =
      result.timestamp || [];

    const quote =
      result.indicators?.quote?.[0] || {};

    const rows = timestamps
      .map((time, index) => ({
        time: Number(time),
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
          Number.isFinite(row.close)
      );

    return NextResponse.json({
      ok: true,
      symbol,
      market,
      interval,
      rows,
      generatedAt:
        new Date().toISOString(),
    });
  } catch (error) {
    console.error(
      'Grafik çalışma alanı hatası:',
      error
    );

    return NextResponse.json(
      {
        ok: false,
        rows: [],
        error:
          error?.message ||
          'Grafik verisi alınamadı.',
      },
      { status: 500 }
    );
  }
}
