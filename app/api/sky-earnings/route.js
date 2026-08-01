export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);

    const symbols = [
      ...new Set(
        String(searchParams.get('symbols') || '')
          .split(',')
          .map((x) => x.trim().toUpperCase())
          .filter(Boolean)
      ),
    ].slice(0, 15);

    if (!symbols.length) {
      return Response.json({ items: [] });
    }

    const wanted = new Set(symbols);
    const upcoming = new Map();

    const today = new Date();

    // Önümüzdeki 45 günü Nasdaq takviminde tara.
    // Her tarih yalnızca 1 kez sorgulanır; hisse başına sorgu yapılmaz.
    for (let start = 0; start < 45; start += 5) {
      const jobs = [];

      for (let offset = start; offset < Math.min(start + 5, 45); offset++) {
        const d = new Date(today);
        d.setUTCDate(today.getUTCDate() + offset);

        jobs.push(fetchNasdaqDay(toISODate(d)));
      }

      const results = await Promise.allSettled(jobs);

      for (const result of results) {
        if (result.status !== 'fulfilled') continue;

        for (const row of result.value) {
          const symbol = String(row?.symbol || '').trim().toUpperCase();

          if (!wanted.has(symbol) || upcoming.has(symbol)) continue;

          upcoming.set(symbol, {
            symbol,
            company: row?.name || symbol,
            date: row?.date || null,
            time: normalizeTime(row?.time),
            epsForecast: cleanValue(row?.epsForecast),
            fiscalQuarterEnding: cleanValue(row?.fiscalQuarterEnding),
            source: 'Nasdaq Earnings Calendar',
            sourceUrl:
              `https://www.nasdaq.com/market-activity/stocks/${symbol.toLowerCase()}/earnings`,
            yahooUrl:
              `https://finance.yahoo.com/quote/${symbol}/analysis/`,
          });
        }
      }

      if (upcoming.size === wanted.size) break;
    }

    const lastReports = await getLastReports(symbols);

    const items = symbols.map((symbol) => ({
      symbol,
      upcoming: upcoming.get(symbol) || null,
      lastReport: lastReports[symbol] || null,
    }));

    return Response.json(
      {
        items,
        generatedAt: new Date().toISOString(),
      },
      {
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      }
    );
  } catch (error) {
    console.error('Sky earnings hatası:', error);

    return Response.json(
      {
        items: [],
        error:
          error instanceof Error
            ? error.message
            : 'Bilanço takvimi alınamadı.',
      },
      { status: 500 }
    );
  }
}

async function fetchNasdaqDay(date) {
  try {
    const response = await fetch(
      `https://api.nasdaq.com/api/calendar/earnings?date=${date}`,
      {
        cache: 'no-store',
        headers: {
          Accept: 'application/json, text/plain, */*',
          Referer: 'https://www.nasdaq.com/',
          'User-Agent': 'Mozilla/5.0 Sky-Finans/1.2',
        },
      }
    );

    if (!response.ok) return [];

    const json = await response.json();
    const rows = json?.data?.rows || [];

    return rows.map((row) => ({
      ...row,
      date,
    }));
  } catch {
    return [];
  }
}

async function getLastReports(symbols) {
  const output = {};

  try {
    const tickerResponse = await fetch(
      'https://www.sec.gov/files/company_tickers.json',
      {
        cache: 'no-store',
        headers: {
          'User-Agent': 'Sky-Finans/1.2',
          Accept: 'application/json',
        },
      }
    );

    if (!tickerResponse.ok) return output;

    const tickerJson = await tickerResponse.json();
    const tickerMap = {};

    for (const row of Object.values(tickerJson || {})) {
      tickerMap[String(row?.ticker || '').toUpperCase()] =
        String(row?.cik_str || '').padStart(10, '0');
    }

    const jobs = symbols.map(async (symbol) => {
      const cik = tickerMap[symbol];
      if (!cik) return;

      try {
        const response = await fetch(
          `https://data.sec.gov/submissions/CIK${cik}.json`,
          {
            cache: 'no-store',
            headers: {
              'User-Agent': 'Sky-Finans/1.2',
              Accept: 'application/json',
            },
          }
        );

        if (!response.ok) return;

        const json = await response.json();
        const recent = json?.filings?.recent;

        const forms = recent?.form || [];
        const dates = recent?.filingDate || [];
        const accession = recent?.accessionNumber || [];

        for (let i = 0; i < forms.length; i++) {
          if (forms[i] !== '10-Q' && forms[i] !== '10-K') continue;

          output[symbol] = {
            form: forms[i],
            date: dates[i],
            accessionNumber: accession[i],
            cik,
            secUrl:
              `https://www.sec.gov/edgar/browse/?CIK=${cik}&owner=exclude&action=getcompany`,
          };

          break;
        }
      } catch {}
    });

    await Promise.allSettled(jobs);
  } catch {}

  return output;
}

function normalizeTime(value) {
  const v = String(value || '').toLowerCase();

  if (v.includes('pre')) return 'Piyasa öncesi';
  if (v.includes('after')) return 'Piyasa sonrası';

  return value || 'Saat açıklanmadı';
}

function cleanValue(value) {
  const v = String(value ?? '').trim();

  if (!v || v === 'N/A' || v === '--') return null;

  return v;
}

function toISODate(date) {
  return date.toISOString().slice(0, 10);
}
