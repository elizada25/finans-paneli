export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 30;

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = String(searchParams.get('symbol') || '')
      .trim()
      .toUpperCase();
    const suppliedPrice = numberValue(searchParams.get('price'));

    if (!symbol || !/^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol)) {
      return Response.json(
        { error: 'Geçerli bir ABD hisse kodu gerekli.' },
        { status: 400 }
      );
    }

    const [optionsResult, shortResult] = await Promise.allSettled([
      getOptions(symbol),
      getShortData(symbol),
    ]);

    const options =
      optionsResult.status === 'fulfilled'
        ? optionsResult.value
        : null;
    const short =
      shortResult.status === 'fulfilled'
        ? shortResult.value
        : null;

    if (!options && !short) {
      throw new Error(
        'Ücretsiz opsiyon ve short veri kaynakları şu anda yanıt vermiyor.'
      );
    }

    const currentPrice =
      suppliedPrice && suppliedPrice > 0
        ? suppliedPrice
        : options?.underlyingPrice || null;

    const pressure = options
      ? calculatePressure(options.contracts, currentPrice)
      : emptyPressure();

    return Response.json(
      {
        symbol,
        currentPrice,
        options: {
          available: Boolean(options?.contracts?.length),
          source: options?.source || null,
          asOf: options?.asOf || null,
          expirations: options?.expirations || [],
          ...pressure,
        },
        short: {
          available: Boolean(short),
          source: short?.source || null,
          settlementDate: short?.settlementDate || null,
          shortInterest: short?.shortInterest ?? null,
          shortPercentOfFloat: short?.shortPercentOfFloat ?? null,
          daysToCover: short?.daysToCover ?? null,
          averageDailyVolume: short?.averageDailyVolume ?? null,
        },
        warnings: [
          optionsResult.status === 'rejected'
            ? 'Opsiyon verisi alınamadı.'
            : null,
          shortResult.status === 'rejected'
            ? 'Short verisi alınamadı.'
            : null,
        ].filter(Boolean),
        generatedAt: new Date().toISOString(),
      },
      {
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      }
    );
  } catch (error) {
    console.error('Opsiyon/short API hatası:', error);

    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Opsiyon ve short verileri alınamadı.',
      },
      { status: 502 }
    );
  }
}

async function getOptions(symbol) {
  try {
    return await getYahooOptions(symbol);
  } catch (yahooError) {
    console.error(`${symbol} Yahoo opsiyon hatası:`, yahooError);
    return getNasdaqOptions(symbol);
  }
}

async function getYahooOptions(symbol) {
  const first = await fetchYahooOptionPage(symbol);
  const result = first?.optionChain?.result?.[0];

  if (!result) {
    throw new Error('Yahoo opsiyon zinciri bulunamadı.');
  }

  const expirationDates = Array.isArray(result.expirationDates)
    ? result.expirationDates.slice(0, 3)
    : [];

  const pages = expirationDates.length
    ? await Promise.all(
        expirationDates.map((date) =>
          fetchYahooOptionPage(symbol, date)
        )
      )
    : [first];

  const contracts = [];

  for (const page of pages) {
    const pageResult = page?.optionChain?.result?.[0];
    const option = pageResult?.options?.[0];

    for (const call of option?.calls || []) {
      contracts.push(normalizeYahooContract(call, 'call'));
    }

    for (const put of option?.puts || []) {
      contracts.push(normalizeYahooContract(put, 'put'));
    }
  }

  const cleanContracts = contracts.filter(
    (item) => Number.isFinite(item.strike)
  );

  if (!cleanContracts.length) {
    throw new Error('Yahoo açık pozisyon verisi boş döndü.');
  }

  return {
    source: 'Yahoo Finance',
    asOf: new Date().toISOString(),
    underlyingPrice: numberValue(result?.quote?.regularMarketPrice),
    expirations: expirationDates.map((item) =>
      new Date(item * 1000).toISOString().slice(0, 10)
    ),
    contracts: cleanContracts,
  };
}

async function fetchYahooOptionPage(symbol, date) {
  const datePart = Number.isFinite(Number(date))
    ? `?date=${Number(date)}`
    : '';
  const response = await fetch(
    `https://query2.finance.yahoo.com/v7/finance/options/${encodeURIComponent(
      symbol
    )}${datePart}`,
    {
      cache: 'no-store',
      headers: marketHeaders(),
    }
  );

  if (!response.ok) {
    throw new Error(`Yahoo ${response.status} hatası verdi.`);
  }

  return response.json();
}

function normalizeYahooContract(item, type) {
  return {
    type,
    strike: numberValue(item?.strike),
    openInterest: numberValue(item?.openInterest) || 0,
    volume: numberValue(item?.volume) || 0,
    expiration: Number.isFinite(Number(item?.expiration))
      ? new Date(Number(item.expiration) * 1000)
          .toISOString()
          .slice(0, 10)
      : null,
  };
}

async function getNasdaqOptions(symbol) {
  const response = await fetch(
    `https://api.nasdaq.com/api/quote/${encodeURIComponent(
      symbol
    )}/option-chain?assetclass=stocks&limit=5000`,
    {
      cache: 'no-store',
      headers: marketHeaders(),
    }
  );

  if (!response.ok) {
    throw new Error(`Nasdaq opsiyon servisi ${response.status} hatası verdi.`);
  }

  const data = await response.json();
  const rows = data?.data?.table?.rows || [];
  const contracts = [];
  let expiration = null;

  for (const row of rows) {
    if (row?.expirygroup && row?.expiryDate) {
      expiration = row.expiryDate;
      continue;
    }

    const strike = parseMarketNumber(row?.strike);
    if (!Number.isFinite(strike)) continue;

    contracts.push({
      type: 'call',
      strike,
      openInterest: parseMarketNumber(
        row?.c_Openinterest ?? row?.c_OpenInterest
      ) || 0,
      volume: parseMarketNumber(row?.c_Volume) || 0,
      expiration: row?.expiryDate || expiration,
    });
    contracts.push({
      type: 'put',
      strike,
      openInterest: parseMarketNumber(
        row?.p_Openinterest ?? row?.p_OpenInterest
      ) || 0,
      volume: parseMarketNumber(row?.p_Volume) || 0,
      expiration: row?.expiryDate || expiration,
    });
  }

  if (!contracts.length) {
    throw new Error('Nasdaq opsiyon zinciri boş döndü.');
  }

  return {
    source: 'Nasdaq',
    asOf: data?.data?.lastTrade || data?.data?.table?.asOf || null,
    underlyingPrice: null,
    expirations: [
      ...new Set(contracts.map((item) => item.expiration).filter(Boolean)),
    ].slice(0, 3),
    contracts,
  };
}

async function getShortData(symbol) {
  const [nasdaqResult, yahooResult] = await Promise.allSettled([
    getNasdaqShort(symbol),
    getYahooShortStats(symbol),
  ]);

  const nasdaq =
    nasdaqResult.status === 'fulfilled' ? nasdaqResult.value : null;
  const yahoo =
    yahooResult.status === 'fulfilled' ? yahooResult.value : null;

  if (!nasdaq && !yahoo) {
    throw new Error('Short verisi bulunamadı.');
  }

  return {
    source: [nasdaq ? 'Nasdaq' : null, yahoo ? 'Yahoo Finance' : null]
      .filter(Boolean)
      .join(' + '),
    settlementDate: nasdaq?.settlementDate || null,
    shortInterest:
      nasdaq?.shortInterest ?? yahoo?.shortInterest ?? null,
    averageDailyVolume: nasdaq?.averageDailyVolume ?? null,
    daysToCover: nasdaq?.daysToCover ?? yahoo?.daysToCover ?? null,
    shortPercentOfFloat: yahoo?.shortPercentOfFloat ?? null,
  };
}

async function getNasdaqShort(symbol) {
  const response = await fetch(
    `https://api.nasdaq.com/api/quote/${encodeURIComponent(
      symbol
    )}/short-interest?assetclass=stocks`,
    {
      cache: 'no-store',
      headers: marketHeaders(),
    }
  );

  if (!response.ok) {
    throw new Error(`Nasdaq short servisi ${response.status} hatası verdi.`);
  }

  const data = await response.json();
  const rows = data?.data?.shortInterestTable?.rows || [];
  const row = rows.find((item) =>
    Number.isFinite(parseMarketNumber(item?.interest))
  );

  if (!row) throw new Error('Nasdaq short tablosu boş döndü.');

  return {
    settlementDate: row.settlementDate || null,
    shortInterest: parseMarketNumber(row.interest),
    averageDailyVolume: parseMarketNumber(row.avgDailyShareVolume),
    daysToCover: parseMarketNumber(row.daysToCover),
  };
}

async function getYahooShortStats(symbol) {
  const response = await fetch(
    `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(
      symbol
    )}?modules=defaultKeyStatistics`,
    {
      cache: 'no-store',
      headers: marketHeaders(),
    }
  );

  if (!response.ok) {
    throw new Error(`Yahoo short servisi ${response.status} hatası verdi.`);
  }

  const data = await response.json();
  const stats =
    data?.quoteSummary?.result?.[0]?.defaultKeyStatistics;

  if (!stats) throw new Error('Yahoo short istatistiği bulunamadı.');

  return {
    shortInterest: rawValue(stats.sharesShort),
    shortPercentOfFloat: percentValue(stats.shortPercentOfFloat),
    daysToCover: rawValue(stats.shortRatio),
  };
}

function calculatePressure(contracts, currentPrice) {
  const byStrike = new Map();
  let totalCallOpenInterest = 0;
  let totalPutOpenInterest = 0;

  for (const contract of contracts) {
    const strike = numberValue(contract.strike);
    const openInterest = Math.max(0, numberValue(contract.openInterest) || 0);
    const volume = Math.max(0, numberValue(contract.volume) || 0);

    if (!Number.isFinite(strike)) continue;

    const item = byStrike.get(strike) || {
      strike,
      callOpenInterest: 0,
      putOpenInterest: 0,
      callVolume: 0,
      putVolume: 0,
    };

    if (contract.type === 'call') {
      item.callOpenInterest += openInterest;
      item.callVolume += volume;
      totalCallOpenInterest += openInterest;
    } else {
      item.putOpenInterest += openInterest;
      item.putVolume += volume;
      totalPutOpenInterest += openInterest;
    }

    byStrike.set(strike, item);
  }

  const allRows = [...byStrike.values()].filter(
    (item) => item.callOpenInterest + item.putOpenInterest > 0
  );

  const callWall = maxBy(allRows, 'callOpenInterest');
  const putWall = maxBy(allRows, 'putOpenInterest');
  const maxPain = calculateMaxPain(allRows);

  let visibleRows = Number.isFinite(currentPrice)
    ? allRows.filter(
        (item) =>
          item.strike >= currentPrice * 0.7 &&
          item.strike <= currentPrice * 1.3
      )
    : allRows;

  visibleRows = visibleRows
    .sort(
      (a, b) =>
        b.callOpenInterest +
        b.putOpenInterest -
        (a.callOpenInterest + a.putOpenInterest)
    )
    .slice(0, 14)
    .sort((a, b) => a.strike - b.strike);

  return {
    totalCallOpenInterest,
    totalPutOpenInterest,
    putCallRatio:
      totalCallOpenInterest > 0
        ? totalPutOpenInterest / totalCallOpenInterest
        : null,
    callWall: callWall?.strike ?? null,
    putWall: putWall?.strike ?? null,
    maxPain,
    rows: visibleRows,
  };
}

function calculateMaxPain(rows) {
  if (!rows.length) return null;

  let bestStrike = null;
  let lowestPain = Infinity;

  for (const candidate of rows) {
    let pain = 0;

    for (const row of rows) {
      pain +=
        row.callOpenInterest * Math.max(0, candidate.strike - row.strike);
      pain +=
        row.putOpenInterest * Math.max(0, row.strike - candidate.strike);
    }

    if (pain < lowestPain) {
      lowestPain = pain;
      bestStrike = candidate.strike;
    }
  }

  return bestStrike;
}

function maxBy(rows, key) {
  return rows.reduce(
    (best, item) => (!best || item[key] > best[key] ? item : best),
    null
  );
}

function emptyPressure() {
  return {
    totalCallOpenInterest: 0,
    totalPutOpenInterest: 0,
    putCallRatio: null,
    callWall: null,
    putWall: null,
    maxPain: null,
    rows: [],
  };
}

function rawValue(value) {
  return numberValue(value?.raw ?? value);
}

function percentValue(value) {
  const raw = rawValue(value);
  if (!Number.isFinite(raw)) return null;
  return Math.abs(raw) <= 1 ? raw * 100 : raw;
}

function numberValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseMarketNumber(value) {
  if (typeof value === 'number') return numberValue(value);
  const clean = String(value || '')
    .replace(/[$,%]/g, '')
    .replace(/,/g, '')
    .trim();
  if (!clean || clean === '--' || clean === 'N/A') return null;
  return numberValue(clean);
}

function marketHeaders() {
  return {
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    Referer: 'https://www.nasdaq.com/',
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36',
  };
}
