import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

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

    const generalQueries = [
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
        return Number.isFinite(published) && now - published <= MAX_AGE_MS;
      })
      .sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
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

      if (items.length >= 12) break;
    }

    return NextResponse.json(
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

function normalizeTitle(value) {
  return String(value || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}