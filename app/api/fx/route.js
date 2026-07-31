export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const response = await fetch(
      'https://query1.finance.yahoo.com/v8/finance/chart/TRY=X?interval=1d&range=5d',
      {
        cache: 'no-store',
        headers: {
          'User-Agent': 'Mozilla/5.0',
          Accept: 'application/json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Yahoo Finance HTTP ${response.status}`);
    }

    const data = await response.json();
    const meta = data?.chart?.result?.[0]?.meta;

    const rate = Number(
      meta?.regularMarketPrice ??
      meta?.previousClose ??
      meta?.chartPreviousClose
    );

    if (!Number.isFinite(rate) || rate <= 0) {
      throw new Error('USD/TRY kuru bulunamadı.');
    }

    return Response.json(
      {
        symbol: 'USD/TRY',
        rate,
        source: 'Yahoo Finance',
        updatedAt: new Date().toISOString(),
      },
      {
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      }
    );
  } catch (error) {
    console.error('USD/TRY API hatası:', error);

    return Response.json(
      {
        error: 'USD/TRY kuru alınamadı.',
      },
      { status: 500 }
    );
  }
}
