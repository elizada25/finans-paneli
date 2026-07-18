export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const body = await request.json();

    const market =
      body?.market === 'bist' ? 'bist' : 'us';

    const codes = Array.isArray(body?.codes)
      ? body.codes
          .map((code) =>
            String(code || '').trim().toUpperCase()
          )
          .filter(Boolean)
      : [];

    if (codes.length === 0) {
      return Response.json({ prices: {} });
    }

    const region =
      market === 'bist' ? 'turkey' : 'america';

    const prefix =
      market === 'bist' ? 'BIST:' : 'NASDAQ:';

    const tradingViewResponse = await fetch(
      `https://scanner.tradingview.com/${region}/scan`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0',
        },
        cache: 'no-store',
        body: JSON.stringify({
          symbols: {
            tickers: codes.map(
              (code) => `${prefix}${code}`
            ),
            query: {
              types: [],
            },
          },
          columns: [
            'close',
            'change_abs',
            'low',
            'high',
          ],
        }),
      }
    );

    if (!tradingViewResponse.ok) {
      throw new Error(
        `Fiyat servisi ${tradingViewResponse.status} hatasÄ± verdi.`
      );
    }

    const tradingViewData =
      await tradingViewResponse.json();

    const prices = {};

    for (const row of tradingViewData.data || []) {
      const code = String(row.s || '')
        .split(':')
        .pop();

      const livePrice = Number(row.d?.[0]);
      const dailyChange = Number(row.d?.[1] || 0);
      const dayLow = Number(row.d?.[2]);
      const dayHigh = Number(row.d?.[3]);

      if (
        code &&
        Number.isFinite(livePrice)
      ) {
        prices[code] = {
          price: livePrice,
          previousClose: livePrice - dailyChange,
          changePercent:
            livePrice - dailyChange !== 0
              ? (dailyChange /
                  (livePrice - dailyChange)) *
                100
              : 0,
          dayLow: Number.isFinite(dayLow) ? dayLow : null,
          dayHigh: Number.isFinite(dayHigh) ? dayHigh : null,
        };
      }
    }

    return Response.json({ prices });
  } catch (error) {
    console.error('Fiyat API hatasÄ±:', error);

    return Response.json(
      {
        prices: {},
        error:
          error?.message ||
          'CanlÄ± fiyatlar alÄ±namadÄ±.',
      },
      {
        status: 500,
      }
    );
  }
}