import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SECTORS = [
  { symbol: 'SOXX', name: 'Yarı İletken', group: 'NASDAQ odaklı' },
  { symbol: 'IGV', name: 'Yazılım', group: 'NASDAQ odaklı' },
  { symbol: 'SKYY', name: 'Bulut Teknolojileri', group: 'NASDAQ odaklı' },
  { symbol: 'HACK', name: 'Siber Güvenlik', group: 'NASDAQ odaklı' },
  { symbol: 'XBI', name: 'Biyoteknoloji', group: 'NASDAQ odaklı' },
  { symbol: 'XLK', name: 'Teknoloji', group: 'Ana sektör' },
  { symbol: 'XLC', name: 'İletişim', group: 'Ana sektör' },
  { symbol: 'XLY', name: 'Tüketici Ürünleri', group: 'Ana sektör' },
  { symbol: 'XLF', name: 'Finans', group: 'Ana sektör' },
  { symbol: 'XLV', name: 'Sağlık', group: 'Ana sektör' },
  { symbol: 'XLI', name: 'Sanayi', group: 'Ana sektör' },
  { symbol: 'XLE', name: 'Enerji', group: 'Ana sektör' },
  { symbol: 'XLP', name: 'Temel Tüketim', group: 'Ana sektör' },
  { symbol: 'XLU', name: 'Kamu Hizmetleri', group: 'Ana sektör' },
  { symbol: 'XLRE', name: 'Gayrimenkul', group: 'Ana sektör' },
  { symbol: 'XLB', name: 'Hammaddeler', group: 'Ana sektör' },
];

function isDate(value) {
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

async function fetchDailyRows(symbol, startDate, endDate) {
  const startSeconds =
    Math.floor(Date.parse(`${startDate}T00:00:00Z`) / 1000) - 21 * 86400;
  const endSeconds =
    Math.floor(Date.parse(`${endDate}T00:00:00Z`) / 1000) + 2 * 86400;
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?period1=${startSeconds}&period2=${endSeconds}&interval=1d&events=history`;

  const response = await fetch(url, {
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Mozilla/5.0 Sky-Finans-Sector-Flow/1.0',
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
    .map((timestamp, index) => {
      const close = Number(adjusted[index] ?? quote.close?.[index]);
      const volume = Number(quote.volume?.[index]);
      return {
        date: new Date(Number(timestamp) * 1000).toISOString().slice(0, 10),
        close,
        volume,
      };
    })
    .filter(
      (row) =>
        Number.isFinite(row.close) &&
        row.close > 0 &&
        Number.isFinite(row.volume) &&
        row.volume >= 0
    );
}

function calculateReturn(rows) {
  if (rows.length < 2) return null;
  return ((rows[rows.length - 1].close / rows[0].close) - 1) * 100;
}

function flowLabel(score) {
  if (score >= 2.5) return 'GÜÇLÜ GİRİŞ';
  if (score >= 0.5) return 'GİRİŞ';
  if (score > -0.5) return 'NÖTR';
  if (score > -2.5) return 'ÇIKIŞ';
  return 'GÜÇLÜ ÇIKIŞ';
}

function analyzeSector(sector, rows, startDate, endDate, benchmarkReturn) {
  const periodRows = rows.filter(
    (row) => row.date >= startDate && row.date <= endDate
  );
  if (periodRows.length < 2) return null;

  const previousRows = rows
    .filter((row) => row.date < periodRows[0].date)
    .slice(-periodRows.length);

  const returnPercent = calculateReturn(periodRows);
  const relativeStrength = returnPercent - benchmarkReturn;
  const averageDollarVolume = average(
    periodRows.map((row) => row.close * row.volume)
  );
  const previousDollarVolume = average(
    previousRows.map((row) => row.close * row.volume)
  );
  const volumeRatio =
    Number.isFinite(previousDollarVolume) && previousDollarVolume > 0
      ? averageDollarVolume / previousDollarVolume
      : null;
  const volumeEffect = Number.isFinite(volumeRatio)
    ? Math.max(-2, Math.min(2, (volumeRatio - 1) * 2))
    : 0;
  const score =
    returnPercent * 0.45 + relativeStrength * 0.4 + volumeEffect * 0.15;

  return {
    ...sector,
    startDate: periodRows[0].date,
    endDate: periodRows[periodRows.length - 1].date,
    returnPercent: round(returnPercent),
    relativeStrength: round(relativeStrength),
    volumeRatio: round(volumeRatio),
    averageDollarVolume: round(averageDollarVolume, 0),
    score: round(score),
    flow: flowLabel(score),
  };
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('start');
    const endDate = searchParams.get('end');

    if (!isDate(startDate) || !isDate(endDate) || startDate >= endDate) {
      return NextResponse.json(
        { ok: false, error: 'Geçerli başlangıç ve bitiş tarihleri seçin.' },
        { status: 400 }
      );
    }

    const dayDifference =
      (Date.parse(`${endDate}T00:00:00Z`) -
        Date.parse(`${startDate}T00:00:00Z`)) /
      86400000;

    if (dayDifference > 90) {
      return NextResponse.json(
        { ok: false, error: 'Tarih aralığı en fazla 90 gün olabilir.' },
        { status: 400 }
      );
    }

    const [benchmarkRows, ...sectorRows] = await Promise.all([
      fetchDailyRows('QQQ', startDate, endDate),
      ...SECTORS.map((sector) =>
        fetchDailyRows(sector.symbol, startDate, endDate)
      ),
    ]);

    const benchmarkPeriod = benchmarkRows.filter(
      (row) => row.date >= startDate && row.date <= endDate
    );
    const benchmarkReturn = calculateReturn(benchmarkPeriod);

    if (!Number.isFinite(benchmarkReturn)) {
      throw new Error('QQQ karşılaştırma verisi alınamadı.');
    }

    const items = SECTORS.map((sector, index) =>
      analyzeSector(
        sector,
        sectorRows[index],
        startDate,
        endDate,
        benchmarkReturn
      )
    )
      .filter(Boolean)
      .sort((first, second) => second.score - first.score);

    return NextResponse.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      requestedStart: startDate,
      requestedEnd: endDate,
      actualStart: benchmarkPeriod[0]?.date || startDate,
      actualEnd: benchmarkPeriod[benchmarkPeriod.length - 1]?.date || endDate,
      benchmark: { symbol: 'QQQ', returnPercent: round(benchmarkReturn) },
      items,
      leader: items[0] || null,
      methodology: 'Getiri + QQQ göreceli güç + işlem hacmi göstergesi',
    });
  } catch (error) {
    console.error('NASDAQ sektör akışı hatası:', error);
    return NextResponse.json(
      {
        ok: false,
        items: [],
        error: error?.message || 'Sektör verileri alınamadı.',
      },
      { status: 500 }
    );
  }
}
