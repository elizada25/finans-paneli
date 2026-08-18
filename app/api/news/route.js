import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 60;

const MAX_AGE_MS = 48 * 60 * 60 * 1000;

const COMPANY_NAMES = {
  EOSE: 'Eos Energy Enterprises',
  ONDS: 'Ondas Holdings',
  PLTR: 'Palantir Technologies',
  RKLB: 'Rocket Lab USA',
  LUNR: 'Intuitive Machines',
  RDW: 'Redwire Corporation',
  MU: 'Micron Technology',
  NVDA: 'Nvidia',
  SOFI: 'SoFi Technologies',
  RXRX: 'Recursion Pharmaceuticals',
  SYM: 'Symbotic',
  PL: 'Planet Labs',
};

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);

    const portalMode =
      searchParams.get('mode') === 'portal';

    const requestedLimit = Number(
      searchParams.get('limit') || 12
    );

    const itemLimit = portalMode
      ? Math.min(Math.max(requestedLimit, 12), 60)
      : 12;

    const maxAgeMs = portalMode
      ? 7 * 24 * 60 * 60 * 1000
      : MAX_AGE_MS;

    const symbols = String(searchParams.get('symbols') || '')
      .split(',')
      .map((item) => item.trim().toUpperCase())
      .filter(Boolean)
      .slice(0, 8);

    const portfolioQueries = symbols.map((symbol) => {
      const companyName = COMPANY_NAMES[symbol];

      return {
        query: companyName
          ? `("${symbol}" OR "${companyName}") stock when:2d`
          : `"${symbol}" stock NASDAQ when:2d`,
        category: symbol,
        priority: 0,
      };
    });

    const generalQueries = portalMode
      ? [
          {
            query:
              '(NASDAQ OR Wall Street OR US stocks) when:1d',
            category: 'SON DAKİKA',
            priority: 1,
          },
          {
            query:
              '(Nvidia OR semiconductor OR artificial intelligence OR cloud OR cybersecurity) stock when:2d',
            category: 'TEKNOLOJİ',
            priority: 1,
          },
          {
            query:
              '(NASDAQ earnings OR quarterly results OR revenue OR guidance) when:2d',
            category: 'BİLANÇO',
            priority: 1,
          },
          {
            query:
              '(biotech OR FDA approval OR clinical trial) stock when:2d',
            category: 'BİYOTEKNOLOJİ',
            priority: 1,
          },
          {
            query:
              '(energy stocks OR oil stocks OR natural gas stocks) when:2d',
            category: 'ENERJİ',
            priority: 1,
          },
          {
            query:
              '(Federal Reserve OR US inflation OR bond yields OR jobs report) when:2d',
            category: 'MAKRO',
            priority: 1,
          },
          {
            query:
              '(investing education OR stock analysis OR market outlook OR how to invest) when:7d',
            category: 'ÖĞREN',
            priority: 2,
          },
        ]
      : [
          {
            query:
              '(NASDAQ OR Wall Street OR US stocks OR technology stocks) when:1d',
            category: 'NASDAQ',
            priority: 1,
          },
          {
            query:
              '(Federal Reserve OR US inflation OR US earnings OR S&P 500) when:1d',
            category: 'ABD',
            priority: 2,
          },
        ];

    const results = await Promise.allSettled(
      [...portfolioQueries, ...generalQueries].map(
        ({ query, category, priority }) =>
          fetchGoogleNewsRss(query, category, priority)
      )
    );

    const now = Date.now();

    const merged = results
      .flatMap((result) =>
        result.status === 'fulfilled' ? result.value : []
      )
      .filter((item) => {
        const published = new Date(item.publishedAt).getTime();
        return Number.isFinite(published) && now - published <= maxAgeMs;
      })
      .sort((a, b) => {
        if (!portalMode && a.priority !== b.priority) {
          return a.priority - b.priority;
        }

        return (
          new Date(b.publishedAt).getTime() -
          new Date(a.publishedAt).getTime()
        );
      });

    const items = [];
    const seen = new Set();

    for (const item of merged) {
      const key = normalizeTitle(item.title);
      if (!key || seen.has(key)) continue;

      seen.add(key);
      items.push(item);

      if (items.length >= itemLimit) break;
    }

    const outputItems = portalMode
      ? await Promise.all(
          items.map(async (item, index) => ({
            ...item,
            titleTr:
              index < 30
                ? await translateTitleFree(item.title)
                : item.title,
          }))
        )
      : items;

    return NextResponse.json(
      {
        items: outputItems,
        generatedAt: new Date().toISOString(),
      },
      {
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      }
    );
  } catch (error) {
    console.error('NASDAQ haber servisi hatasÄ±:', error);

    return NextResponse.json(
      {
        items: [],
        error:
          error instanceof Error ? error.message : 'Bilinmeyen hata',
      },
      { status: 500 }
    );
  }
}

async function fetchGoogleNewsRss(query, category, priority) {
  const url =
    'https://news.google.com/rss/search?' +
    new URLSearchParams({
      q: query,
      hl: 'en-US',
      gl: 'US',
      ceid: 'US:en',
    }).toString();

  const response = await fetch(url, {
    cache: 'no-store',
    headers: {
      'User-Agent': 'Mozilla/5.0 Sky-Finans/1.0',
      Accept: 'application/rss+xml, application/xml, text/xml',
    },
  });

  if (!response.ok) {
    throw new Error(`Google News RSS ${response.status} hatasÄ±`);
  }

  return parseItems(await response.text(), category, priority);
}

function parseItems(xml, category, priority) {
  const blocks = xml.match(/<item>[\s\S]*?<\/item>/g) || [];

  return blocks
    .map((block) => {
      const rawTitle = getTag(block, 'title');
      const titleParts = decodeXml(rawTitle).split(' - ');
      const sourceFromTag = decodeXml(getTag(block, 'source'));
      const source =
        sourceFromTag || (titleParts.length > 1 ? titleParts.pop() : '');

      const date = new Date(decodeXml(getTag(block, 'pubDate')));
      if (Number.isNaN(date.getTime())) return null;

      return {
        title: titleParts.join(' - ').trim() || decodeXml(rawTitle),
        link: decodeXml(getTag(block, 'link')),
        source: source.trim(),
        publishedAt: date.toISOString(),
        timeLabel: date.toLocaleString('tr-TR', {
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        }),
        category,
        priority,
      };
    })
    .filter((item) => item && item.title && item.link);
}

function getTag(block, tag) {
  const match = block.match(
    new RegExp(
      `<${tag}(?:\\s[^>]*)?>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`,
      'i'
    )
  );

  return match ? match[1].trim() : '';
}

function decodeXml(value) {
  return String(value || '')
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, code) =>
      String.fromCharCode(Number(code))
    );
}


async function translateTitleFree(title) {
  try {
    const query = new URLSearchParams({
      client: 'gtx',
      sl: 'auto',
      tl: 'tr',
      dt: 't',
      q: title,
    });

    const response = await fetch(
      `https://translate.googleapis.com/translate_a/single?${query.toString()}`,
      {
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Mozilla/5.0 Sky-Finans-News-Portal/1.0',
        },
        signal: AbortSignal.timeout(8000),
      }
    );

    if (!response.ok) return title;

    const data = await response.json();

    const translated = Array.isArray(data?.[0])
      ? data[0]
          .map((part) => part?.[0] || '')
          .join('')
          .replace(/\s+/g, ' ')
          .trim()
      : '';

    return translated || title;
  } catch {
    return title;
  }
}

function normalizeTitle(value) {
  return String(value || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}