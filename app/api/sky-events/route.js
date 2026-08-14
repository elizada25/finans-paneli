export const dynamic = 'force-dynamic';
export const revalidate = 0;

const FOMC_DATES = [
  { start: '2026-09-15', end: '2026-09-16' },
  { start: '2026-10-27', end: '2026-10-28' },
  { start: '2026-12-08', end: '2026-12-09' },

  { start: '2027-01-26', end: '2027-01-27' },
  { start: '2027-03-16', end: '2027-03-17' },
  { start: '2027-04-27', end: '2027-04-28' },
  { start: '2027-06-08', end: '2027-06-09' },
  { start: '2027-07-27', end: '2027-07-28' },
  { start: '2027-09-14', end: '2027-09-15' },
  { start: '2027-10-26', end: '2027-10-27' },
  { start: '2027-12-07', end: '2027-12-08' },
];

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);

    const symbols = String(searchParams.get('symbols') || '')
      .split(',')
      .map((x) => x.trim().toUpperCase())
      .filter(Boolean)
      .slice(0, 12);

    const [macroResult, filingsResult] = await Promise.allSettled([
      getMacroEvents(),
      getLatestFilings(symbols),
    ]);

    const events = [];

    if (macroResult.status === 'fulfilled') {
      events.push(...macroResult.value);
    }

    if (filingsResult.status === 'fulfilled') {
      events.push(...filingsResult.value);
    }

    events.sort(compareEvents);

    return Response.json(
      {
        events: events.slice(0, 20),
        generatedAt: new Date().toISOString(),
      },
      {
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      }
    );
  } catch (error) {
    console.error('Sky Events hatası:', error);

    return Response.json(
      {
        events: [],
        error:
          error instanceof Error
            ? error.message
            : 'Sky Events bilinmeyen hata.',
      },
      { status: 500 }
    );
  }
}

async function getMacroEvents() {
  const events = [];
  const now = Date.now();
  const recentLimit = now - 14 * 86400000;
  const upcomingLimit = now + 35 * 86400000;

  // -------------------------------------------------------
  // FED / FOMC
  // -------------------------------------------------------
  const nextFed = FOMC_DATES
    .map((item) => ({
      ...item,
      sortTime: new Date(`${item.start}T00:00:00Z`).getTime(),
    }))
    .find((item) => item.sortTime >= now - 24 * 60 * 60 * 1000);

  if (nextFed) {
    const days = daysUntil(nextFed.sortTime);

    events.push({
      type: 'FED',
      status: 'upcoming',
      level: days <= 7 ? 'critical' : 'important',
      title: 'FED / FOMC',
      text:
        `Sıradaki FOMC toplantısı ${formatDate(nextFed.start)}–` +
        `${formatDay(nextFed.end)}. ${daysLabel(days)}`,
      url: 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm',
      sortTime: nextFed.sortTime,
    });
  }

  // -------------------------------------------------------
  // BLS — CPI / PPI / Employment Situation
  // -------------------------------------------------------
  try {
    const blsResponse = await fetch(
      'https://www.bls.gov/schedule/news_release/bls.ics',
      {
        cache: 'no-store',
        headers: {
          'User-Agent': 'Mozilla/5.0 Sky-Finans/1.0',
          Accept: 'text/calendar,text/plain,*/*',
        },
      }
    );

    if (blsResponse.ok) {
      const ics = await blsResponse.text();

      const latestBLS = await getLatestBLSValues();

      const blsEvents = parseICS(ics)
        .filter((event) => {
          const s = event.summary.toLowerCase();

          return (
            s.includes('consumer price index') ||
            s.includes('producer price index') ||
            s.includes('employment situation')
          );
        })
        .filter(
          (event) =>
            event.sortTime >= recentLimit &&
            event.sortTime <= upcomingLimit
        );

      for (const event of blsEvents) {
        const title = normalizeBLSTitle(event.summary);
        const isRecent = event.sortTime < now;
        const days = daysUntil(event.sortTime);
        const result = latestBLS[title];

        events.push({
          type: 'MACRO',
          status: isRecent ? 'recent' : 'upcoming',
          level: isRecent || days <= 2 ? 'critical' : 'important',
          title,
          text: isRecent
            ? buildRecentBLSText(event.sortTime, result)
            : `${formatDateTime(event.sortTime)}. ${daysLabel(days)}`,
          url: getBLSUrl(title),
          sortTime: event.sortTime,
        });
      }
    }
  } catch (error) {
    console.error('BLS takvimi alınamadı:', error);
  }

  // -------------------------------------------------------
  // BEA — GDP
  // -------------------------------------------------------
  try {
    const response = await fetch(
      'https://www.bea.gov/news/schedule/full',
      {
        cache: 'no-store',
        headers: {
          'User-Agent': 'Mozilla/5.0 Sky-Finans/1.0',
          Accept: 'text/html',
        },
      }
    );

    if (response.ok) {
      const html = await response.text();
      const year = new Date().getUTCFullYear();
      const rows =
        html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];

      for (const row of rows) {
        const clean = stripHtml(row).replace(/\s+/g, ' ').trim();

        if (!/\bGDP\b/i.test(clean)) continue;

        const match = clean.match(
          /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})\s+(\d{1,2}:\d{2}\s+(?:AM|PM))/i
        );

        if (!match) continue;

        const month = monthNumber(match[1]);
        const day = Number(match[2]);
        const time = match[3];

        const sortTime = easternDateToUtc(year, month, day, time);

        if (
          !sortTime ||
          sortTime < now - 60 * 60 * 1000 ||
          sortTime > upcomingLimit
        ) {
          continue;
        }

        const days = daysUntil(sortTime);

        events.push({
          type: 'MACRO',
          status: 'upcoming',
          level: days <= 2 ? 'critical' : 'important',
          title: 'ABD GDP',
          text:
            `ABD GDP verisi ${formatDateTime(sortTime)}. ` +
            `${daysLabel(days)}`,
          url: 'https://www.bea.gov/news/schedule',
          sortTime,
        });

        break;
      }
    }
  } catch (error) {
    console.error('BEA GDP takvimi alınamadı:', error);
  }

  return events.sort(compareEvents);
}

async function getLatestBLSValues() {
  const seriesIds = [
    'CES0000000001',
    'LNS14000000',
    'CUSR0000SA0',
    'WPSFD4',
  ];

  try {
    const year = new Date().getUTCFullYear();
    const response = await fetch(
      'https://api.bls.gov/publicAPI/v2/timeseries/data/',
      {
        method: 'POST',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'User-Agent': 'Sky-Finans/1.0',
        },
        body: JSON.stringify({
          seriesid: seriesIds,
          startyear: String(year - 1),
          endyear: String(year),
        }),
      }
    );

    if (!response.ok) return {};

    const data = await response.json();
    const seriesMap = {};

    for (const series of data?.Results?.series || []) {
      seriesMap[series.seriesID] = monthlyValues(series.data);
    }

    const payroll = seriesMap.CES0000000001 || [];
    const unemployment = seriesMap.LNS14000000 || [];
    const cpi = seriesMap.CUSR0000SA0 || [];
    const ppi = seriesMap.WPSFD4 || [];

    const latestPayroll = difference(payroll, 0);
    const previousPayroll = difference(payroll, 1);
    const latestCPI = percentChange(cpi, 0);
    const previousCPI = percentChange(cpi, 1);
    const latestPPI = percentChange(ppi, 0);
    const previousPPI = percentChange(ppi, 1);

    return {
      'ABD İstihdam': {
        actual:
          `Tarım dışı ${formatSignedThousands(latestPayroll)} • ` +
          `İşsizlik ${formatPercent(unemployment[0])}`,
        previous:
          `${formatSignedThousands(previousPayroll)} • ` +
          `${formatPercent(unemployment[1])}`,
      },
      'ABD CPI': {
        actual: formatPercent(latestCPI),
        previous: formatPercent(previousCPI),
      },
      'ABD PPI': {
        actual: formatPercent(latestPPI),
        previous: formatPercent(previousPPI),
      },
    };
  } catch (error) {
    console.error('BLS son verileri alınamadı:', error);
    return {};
  }
}

function monthlyValues(data) {
  return (Array.isArray(data) ? data : [])
    .filter((item) => /^M(0[1-9]|1[0-2])$/.test(item?.period || ''))
    .map((item) => Number(item.value))
    .filter(Number.isFinite);
}

function difference(values, offset) {
  const current = values[offset];
  const previous = values[offset + 1];

  if (!Number.isFinite(current) || !Number.isFinite(previous)) {
    return null;
  }

  return current - previous;
}

function percentChange(values, offset) {
  const current = values[offset];
  const previous = values[offset + 1];

  if (
    !Number.isFinite(current) ||
    !Number.isFinite(previous) ||
    previous === 0
  ) {
    return null;
  }

  return ((current / previous) - 1) * 100;
}

function formatSignedThousands(value) {
  if (!Number.isFinite(value)) return 'veri bekleniyor';

  const rounded = Math.round(value);
  return `${rounded > 0 ? '+' : ''}${rounded.toLocaleString('tr-TR')} bin`;
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return 'veri bekleniyor';

  const normalized = Math.abs(value) < 0.05 ? 0 : value;
  const number = Math.abs(normalized).toLocaleString('tr-TR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

  return `${normalized < 0 ? '-' : ''}%${number}`;
}

function buildRecentBLSText(sortTime, result) {
  if (!result?.actual) {
    return `Sonuç açıklandı: ${formatDateTime(sortTime)}. Ayrıntı için dokunun.`;
  }

  return (
    `Açıklanan: ${result.actual}. ` +
    `Önceki: ${result.previous || '-'}. ` +
    `${formatDateTime(sortTime)}.`
  );
}

function compareEvents(a, b) {
  const aRecent = a.status === 'recent';
  const bRecent = b.status === 'recent';

  if (aRecent && bRecent) {
    return (b.sortTime || 0) - (a.sortTime || 0);
  }

  if (aRecent !== bRecent) return aRecent ? -1 : 1;

  return (
    (a.sortTime || Number.MAX_SAFE_INTEGER) -
    (b.sortTime || Number.MAX_SAFE_INTEGER)
  );
}

async function getLatestFilings(symbols) {
  if (!symbols.length) return [];

  const events = [];

  try {
    const tickerResponse = await fetch(
      'https://www.sec.gov/files/company_tickers.json',
      {
        cache: 'no-store',
        headers: {
          'User-Agent': 'Sky Finans contact@example.com',
          Accept: 'application/json',
        },
      }
    );

    if (!tickerResponse.ok) return [];

    const tickerData = await tickerResponse.json();

    const tickerMap = {};

    for (const item of Object.values(tickerData || {})) {
      tickerMap[String(item.ticker || '').toUpperCase()] = String(
        item.cik_str || ''
      ).padStart(10, '0');
    }

    for (const symbol of symbols.slice(0, 6)) {
      const cik = tickerMap[symbol];
      if (!cik) continue;

      try {
        const response = await fetch(
          `https://data.sec.gov/submissions/CIK${cik}.json`,
          {
            cache: 'no-store',
            headers: {
              'User-Agent': 'Sky Finans contact@example.com',
              Accept: 'application/json',
            },
          }
        );

        if (!response.ok) continue;

        const data = await response.json();

        const recent = data?.filings?.recent;
        const forms = recent?.form || [];
        const dates = recent?.filingDate || [];

        let latest = null;

        for (let i = 0; i < forms.length; i++) {
          if (forms[i] === '10-Q' || forms[i] === '10-K') {
            latest = {
              form: forms[i],
              date: dates[i],
            };
            break;
          }
        }

        if (!latest?.date) continue;

        const filingTime = new Date(
          `${latest.date}T00:00:00Z`
        ).getTime();

        const ageDays = Math.floor(
          (Date.now() - filingTime) / 86400000
        );

        events.push({
          type: 'EARNINGS',
          level: ageDays <= 14 ? 'critical' : 'info',
          title: `${symbol} Bilanço`,
          text:
            `${symbol} son ${latest.form} finansal raporunu ` +
            `${formatDate(latest.date)} tarihinde SEC'e bildirdi.`,
          url: `https://finance.yahoo.com/quote/${symbol}/financials/`,
          sortTime:
            ageDays <= 30
              ? Date.now() + ageDays * 1000
              : Number.MAX_SAFE_INTEGER - ageDays,
        });
      } catch (error) {
        console.error(`${symbol} SEC bilgisi alınamadı:`, error);
      }
    }
  } catch (error) {
    console.error('SEC şirket listesi alınamadı:', error);
  }

  return events;
}

function parseICS(text) {
  const blocks =
    String(text || '').match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) || [];

  return blocks
    .map((block) => {
      const summary =
        block.match(/^SUMMARY:(.+)$/m)?.[1]?.trim() || '';

      const rawDate =
        block.match(/^DTSTART[^:]*:(.+)$/m)?.[1]?.trim() || '';

      const sortTime = parseICSDate(rawDate);

      return {
        summary,
        sortTime,
      };
    })
    .filter(
      (item) =>
        item.summary &&
        Number.isFinite(item.sortTime)
    )
    .sort((a, b) => a.sortTime - b.sortTime);
}

function parseICSDate(value) {
  const match = String(value).match(
    /(\d{4})(\d{2})(\d{2})T?(\d{2})?(\d{2})?/
  );

  if (!match) return NaN;

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const hour = Number(match[4] || 8);
  const minute = Number(match[5] || 30);

  if (String(value).trim().endsWith('Z')) {
    return Date.UTC(year, month, day, hour, minute);
  }

  return easternPartsToUtc(year, month + 1, day, hour, minute);
}

function getBLSUrl(title) {
  if (title === 'ABD CPI') {
    return 'https://www.bls.gov/news.release/cpi.nr0.htm';
  }

  if (title === 'ABD PPI') {
    return 'https://www.bls.gov/news.release/ppi.nr0.htm';
  }

  if (title === 'ABD İstihdam') {
    return 'https://www.bls.gov/news.release/empsit.nr0.htm';
  }

  return 'https://www.bls.gov/schedule/news_release/';
}

function normalizeBLSTitle(value) {
  const v = String(value || '').toLowerCase();

  if (v.includes('consumer price index')) return 'ABD CPI';
  if (v.includes('producer price index')) return 'ABD PPI';
  if (v.includes('employment situation')) return 'ABD İstihdam';

  return value;
}

function daysUntil(time) {
  return Math.max(
    0,
    Math.ceil((time - Date.now()) / 86400000)
  );
}

function daysLabel(days) {
  if (days === 0) return 'Bugün açıklanıyor.';
  if (days === 1) return 'Yarın açıklanıyor.';
  return `${days} gün kaldı.`;
}

function formatDate(value) {
  const date =
    typeof value === 'number'
      ? new Date(value)
      : new Date(`${value}T12:00:00Z`);

  return date.toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Istanbul',
  });
}

function formatDay(value) {
  const date = new Date(`${value}T12:00:00Z`);

  return date.toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: 'long',
    timeZone: 'Europe/Istanbul',
  });
}

function formatDateTime(time) {
  return new Date(time).toLocaleString('tr-TR', {
    day: '2-digit',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Istanbul',
  });
}

function monthNumber(name) {
  const months = {
    january: 1,
    february: 2,
    march: 3,
    april: 4,
    may: 5,
    june: 6,
    july: 7,
    august: 8,
    september: 9,
    october: 10,
    november: 11,
    december: 12,
  };

  return months[String(name).toLowerCase()] || null;
}

function easternDateToUtc(year, month, day, timeText) {
  const match = String(timeText).match(
    /(\d{1,2}):(\d{2})\s+(AM|PM)/i
  );

  if (!match) return null;

  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const ampm = match[3].toUpperCase();

  if (ampm === 'PM' && hour !== 12) hour += 12;
  if (ampm === 'AM' && hour === 12) hour = 0;

  return easternPartsToUtc(year, month, day, hour, minute);
}

function easternPartsToUtc(year, month, day, hour, minute) {
  const offset = isEasternDaylightTime(year, month, day) ? 4 : 5;
  return Date.UTC(year, month - 1, day, hour + offset, minute);
}

function isEasternDaylightTime(year, month, day) {
  const secondSundayMarch = nthSunday(year, 3, 2);
  const firstSundayNovember = nthSunday(year, 11, 1);

  if (month < 3 || month > 11) return false;
  if (month > 3 && month < 11) return true;
  if (month === 3) return day >= secondSundayMarch;
  return day < firstSundayNovember;
}

function nthSunday(year, month, occurrence) {
  const firstDay = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const firstSunday = 1 + ((7 - firstDay) % 7);
  return firstSunday + (occurrence - 1) * 7;
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n+/g, '\n');
}
