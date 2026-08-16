import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SECTOR_STOCKS = {
  XLE: ['XOM', 'CVX', 'COP', 'EOG', 'SLB', 'MPC', 'PSX', 'VLO', 'WMB', 'KMI', 'OXY', 'HAL', 'BKR', 'DVN', 'FANG'],
  SKYY: ['AMZN', 'MSFT', 'GOOGL', 'ORCL', 'CRM', 'NOW', 'SNOW', 'DDOG', 'NET', 'MDB', 'WDAY', 'AKAM'],
  HACK: ['PANW', 'CRWD', 'FTNT', 'ZS', 'OKTA', 'CYBR', 'CHKP', 'GEN', 'TENB', 'S'],
  XLU: ['NEE', 'SO', 'DUK', 'CEG', 'VST', 'AEP', 'SRE', 'D', 'EXC', 'XEL', 'PEG', 'ED', 'WEC', 'ETR'],
  XLC: ['META', 'GOOGL', 'NFLX', 'DIS', 'T', 'VZ', 'TMUS', 'CHTR', 'WBD', 'PARA', 'FOXA'],
  IGV: ['MSFT', 'ORCL', 'CRM', 'ADBE', 'NOW', 'INTU', 'PLTR', 'PANW', 'CRWD', 'SNPS', 'CDNS', 'ADSK', 'TEAM', 'DDOG'],
  SOXX: ['NVDA', 'AVGO', 'AMD', 'MU', 'QCOM', 'AMAT', 'LRCX', 'KLAC', 'INTC', 'TXN', 'ADI', 'NXPI', 'MCHP', 'MRVL', 'ON'],
  XLP: ['WMT', 'COST', 'PG', 'KO', 'PEP', 'PM', 'MO', 'MDLZ', 'CL', 'KMB', 'GIS', 'KHC', 'SYY', 'STZ'],
  XLK: ['AAPL', 'MSFT', 'NVDA', 'AVGO', 'ORCL', 'CRM', 'CSCO', 'IBM', 'ACN', 'AMD', 'ADBE', 'QCOM'],
  XLF: ['JPM', 'BAC', 'WFC', 'GS', 'MS', 'C', 'V', 'MA', 'AXP', 'SCHW', 'BLK', 'COF', 'USB'],
  XLV: ['LLY', 'JNJ', 'UNH', 'ABBV', 'MRK', 'TMO', 'ABT', 'AMGN', 'GILD', 'ISRG', 'PFE', 'BMY', 'MDT', 'BSX'],
  XLI: ['GE', 'CAT', 'RTX', 'BA', 'UBER', 'UNP', 'HON', 'ETN', 'DE', 'LMT', 'UPS', 'ADP', 'WM', 'GD'],
  XLRE: ['PLD', 'AMT', 'EQIX', 'WELL', 'SPG', 'O', 'CCI', 'DLR', 'PSA', 'CBRE', 'VICI', 'AVB', 'EQR'],
  XBI: ['MRNA', 'GILD', 'AMGN', 'VRTX', 'REGN', 'BIIB', 'ALNY', 'BMRN', 'ILMN', 'INCY', 'UTHR', 'EXEL', 'CRSP'],
  XLB: ['LIN', 'SHW', 'FCX', 'NEM', 'APD', 'ECL', 'NUE', 'DOW', 'CTVA', 'MLM', 'VMC', 'DD', 'IFF', 'ALB'],
  XLY: ['AMZN', 'TSLA', 'HD', 'MCD', 'BKNG', 'TJX', 'LOW', 'SBUX', 'NKE', 'MAR', 'ORLY', 'GM', 'F'],
};

function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

function round(value, digits = 2) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const factor = 10 ** digits;
  return Math.round(number * factor) / factor;
}

function average(values) {
  const valid = values.filter(Number.isFinite);
  if (!valid.length) return null;
  return valid.reduce((total, value) => total + value, 0) / valid.length;
}

async function fetchRows(symbol, startDate, endDate) {
  const period1 =
    Math.floor(Date.parse(`${startDate}T00:00:00Z`) / 1000) - 21 * 86400;
  const period2 =
    Math.floor(Date.parse(`${endDate}T00:00:00Z`) / 1000) + 2 * 86400;
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?period1=${period1}&period2=${period2}&interval=1d&events=history`;

  const response = await fetch(url, {
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Mozilla/5.0 Sky-Finans-Sector-Stocks/1.0',
    },
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) return [];

  const result = (await response.json())?.chart?.result?.[0];
  if (!result) return [];

  const timestamps = result.timestamp || [];
  const quote = result.indicators?.quote?.[0] || {};
  const adjusted = result.indicators?.adjclose?.[0]?.adjclose || [];

  return timestamps
    .map((timestamp, index) => ({
      date: new Date(Number(timestamp) * 1000).toISOString().slice(0, 10),
      close: Number(adjusted[index] ?? quote.close?.[index]),
      volume: Number(quote.volume?.[index]),
    }))
    .filter(
      (row) =>
        Number.isFinite(row.close) &&
        row.close > 0 &&
        Number.isFinite(row.volume) &&
        row.volume >= 0
    );
}

function analyzeStock(symbol, rows, startDate, endDate) {
  const periodRows = rows.filter(
    (row) => row.date >= startDate && row.date <= endDate
  );
  if (periodRows.length < 2) return null;

  const previousRows = rows
    .filter((row) => row.date < periodRows[0].date)
    .slice(-periodRows.length);
  const first = periodRows[0];
  const last = periodRows[periodRows.length - 1];
  const returnPercent = ((last.close / first.close) - 1) * 100;
  const currentAverageVolume = average(periodRows.map((row) => row.volume));
  const previousAverageVolume = average(previousRows.map((row) => row.volume));
  const volumeRatio =
    Number.isFinite(previousAverageVolume) && previousAverageVolume > 0
      ? currentAverageVolume / previousAverageVolume
      : null;

  return {
    symbol,
    startDate: first.date,
    endDate: last.date,
    startPrice: round(first.close),
    price: round(last.close),
    returnPercent: round(returnPercent),
    volumeRatio: round(volumeRatio),
    averageVolume: round(currentAverageVolume, 0),
  };
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const sector = String(searchParams.get('sector') || '').toUpperCase();
    const startDate = searchParams.get('start');
    const endDate = searchParams.get('end');
    const symbols = SECTOR_STOCKS[sector];

    if (!symbols) {
      return NextResponse.json(
        { ok: false, error: 'Geçerli bir sektör seçin.' },
        { status: 400 }
      );
    }

    if (!validDate(startDate) || !validDate(endDate) || startDate >= endDate) {
      return NextResponse.json(
        { ok: false, error: 'Geçerli başlangıç ve bitiş tarihleri seçin.' },
        { status: 400 }
      );
    }

    const rows = await Promise.all(
      symbols.map((symbol) => fetchRows(symbol, startDate, endDate))
    );
    const items = symbols
      .map((symbol, index) =>
        analyzeStock(symbol, rows[index], startDate, endDate)
      )
      .filter(Boolean)
      .sort((first, second) => second.returnPercent - first.returnPercent);

    return NextResponse.json({
      ok: true,
      sector,
      requestedStart: startDate,
      requestedEnd: endDate,
      count: items.length,
      items,
      note: 'Likiditesi yüksek temsilci hisseler',
    });
  } catch (error) {
    console.error('NASDAQ sektör hisseleri hatası:', error);
    return NextResponse.json(
      {
        ok: false,
        items: [],
        error: error?.message || 'Sektör hisseleri alınamadı.',
      },
      { status: 500 }
    );
  }
}
