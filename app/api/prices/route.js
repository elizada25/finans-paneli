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

    const exchangePriority = {
      NASDAQ: 1,
      NYSE: 2,
      AMEX: 3,
      CBOE: 4,
    };

    const requestedTickers =
      market === 'bist'
        ? codes.map((code) => `BIST:${code}`)
        : codes.flatMap((code) => [
            `NASDAQ:${code}`,
            `NYSE:${code}`,
            `AMEX:${code}`,
            `CBOE:${code}`,
          ]);

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
            tickers: requestedTickers,
            query: {
              types: [],
            },
          },
          columns: [
            'close',
            'change_abs',
            'low',
            'high',
            ...(
              market === 'us'
                ? [
                    'premarket_close',
                    'premarket_change',
                    'postmarket_close',
                    'postmarket_change',
                  ]
                : []
            ),
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
      const [exchange = '', rawCode = ''] =
        String(row.s || '').split(':');
      const code = rawCode.trim().toUpperCase();

      const livePrice = Number(row.d?.[0]);
      const dailyChange = Number(row.d?.[1] || 0);
      const dayLow = Number(row.d?.[2]);
      const dayHigh = Number(row.d?.[3]);
      const preMarketPrice =
        market === 'us'
          ? Number(row.d?.[4])
          : null;
      const preMarketChangePercent =
        market === 'us'
          ? Number(row.d?.[5])
          : null;
      const afterMarketPrice =
        market === 'us'
          ? Number(row.d?.[6])
          : null;
      const afterMarketChangePercent =
        market === 'us'
          ? Number(row.d?.[7])
          : null;

      if (
        code &&
        Number.isFinite(livePrice)
      ) {
        const current = prices[code];
        const currentPriority =
          exchangePriority[current?.exchange] ?? 99;
        const candidatePriority =
          exchangePriority[exchange] ?? 99;

        if (current && currentPriority <= candidatePriority) {
          continue;
        }

        prices[code] = {
          code,
          exchange,
          assetType: market === 'us' ? 'stock-or-fund' : 'stock',
          price: livePrice,
          previousClose: livePrice - dailyChange,
          changePercent:
            livePrice - dailyChange !== 0
              ? (dailyChange /
                  (livePrice - dailyChange)) *
                100
              : 0,
          dayLow:
            Number.isFinite(dayLow)
              ? dayLow
              : null,
          dayHigh:
            Number.isFinite(dayHigh)
              ? dayHigh
              : null,
          preMarketPrice:
            Number.isFinite(preMarketPrice)
              ? preMarketPrice
              : null,
          preMarketChangePercent:
            Number.isFinite(
              preMarketChangePercent
            )
              ? preMarketChangePercent
              : null,
          afterMarketPrice:
            Number.isFinite(afterMarketPrice)
              ? afterMarketPrice
              : null,
          afterMarketChangePercent:
            Number.isFinite(
              afterMarketChangePercent
            )
              ? afterMarketChangePercent
              : null,
          extendedHoursFetchedAt:
            new Date().toISOString(),
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
