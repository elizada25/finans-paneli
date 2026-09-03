export const dynamic = 'force-dynamic';

function validYearMonth(year, month) {
  return Number.isInteger(year) && year >= 2000 && year <= 2100 &&
    Number.isInteger(month) && month >= 1 && month <= 12;
}

function tcmbUrl(year, month, day) {
  const yyyy = String(year);
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `https://www.tcmb.gov.tr/kurlar/${yyyy}${mm}/${dd}${mm}${yyyy}.xml`;
}

function usdSellingRate(xml) {
  const currency = String(xml || '').match(
    /<Currency[^>]*CurrencyCode=["']USD["'][^>]*>([\s\S]*?)<\/Currency>/i
  )?.[1];
  const raw = currency?.match(/<ForexSelling>([^<]+)<\/ForexSelling>/i)?.[1];
  const rate = Number(String(raw || '').replace(',', '.'));
  return Number.isFinite(rate) && rate > 0 ? rate : 0;
}

async function firstMonthlyRate(year, month) {
  const now = new Date();
  const todayParts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(now).filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value])
  );
  const todayKey = Number(`${todayParts.year}${todayParts.month}${todayParts.day}`);

  for (let day = 1; day <= 10; day += 1) {
    const candidate = new Date(Date.UTC(year, month - 1, day));
    if (candidate.getUTCMonth() !== month - 1) break;
    const dateKey = year * 10000 + month * 100 + day;
    if (dateKey > todayKey) break;

    const response = await fetch(tcmbUrl(year, month, day), {
      cache: 'no-store',
      headers: { 'User-Agent': 'Sky Finans/1.0', Accept: 'application/xml,text/xml' },
    });
    if (!response.ok) continue;

    const rate = usdSellingRate(await response.text());
    if (!rate) continue;

    return {
      symbol: 'USD/TRY', rate, source: 'TCMB',
      rateType: 'ForexSelling', policy: 'first-published-business-day',
      rateDate: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      updatedAt: new Date().toISOString(),
    };
  }

  throw new Error('Bu ay için yayımlanmış TCMB kuru bulunamadı.');
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const yearParam = url.searchParams.get('year');
    const monthParam = url.searchParams.get('month');

    if (yearParam || monthParam) {
      const year = Number(yearParam);
      const month = Number(monthParam);
      if (!validYearMonth(year, month)) {
        return Response.json({ error: 'Geçerli yıl ve ay zorunludur.' }, { status: 400 });
      }
      return Response.json(await firstMonthlyRate(year, month), {
        headers: { 'Cache-Control': 'public, s-maxage=31536000, stale-while-revalidate=86400' },
      });
    }

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
        error: error?.message || 'USD/TRY kuru alınamadı.',
      },
      { status: 500 }
    );
  }
}
