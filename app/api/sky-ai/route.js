export const dynamic = 'force-dynamic';
export const revalidate = 0;

const COMPANY_NAMES = {
  EOSE: 'Eos Energy Enterprises',
  ONDS: 'Ondas Holdings',
  PLTR: 'Palantir Technologies',
  RKLB: 'Rocket Lab USA',
  MU: 'Micron Technology',
  NVDA: 'Nvidia',
  IREN: 'IREN Limited',
  TEM: 'Tempus AI',
  AMBA: 'Ambarella',
  CRWV: 'CoreWeave',
  SOFI: 'SoFi Technologies',
  LUNR: 'Intuitive Machines',
  RDW: 'Redwire Corporation',
  RXRX: 'Recursion Pharmaceuticals',
  SYM: 'Symbotic',
};

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);

    const symbol = String(searchParams.get('symbol') || '')
      .trim()
      .toUpperCase();

    const market =
      String(searchParams.get('market') || 'us').toLowerCase() === 'bist'
        ? 'bist'
        : 'us';

    const cost = Number(searchParams.get('cost') || 0);
    const quantity = Number(searchParams.get('quantity') || 0);
    const panelPrice = Number(searchParams.get('current') || 0);

    if (!symbol || !/^[A-Z0-9.%-]{1,15}$/.test(symbol)) {
      return Response.json(
        { error: 'Geçerli bir hisse kodu gerekli.' },
        { status: 400 }
      );
    }

    const yahooSymbol = market === 'bist' ? `${symbol}.IS` : symbol;

    const [technicalResult, newsResult] = await Promise.allSettled([
      getTechnicalData(yahooSymbol),
      getNews(symbol),
    ]);

    if (technicalResult.status !== 'fulfilled') {
      throw new Error(
        technicalResult.reason?.message || 'Teknik fiyat geçmişi alınamadı.'
      );
    }

    const technical = technicalResult.value;
    const news =
      newsResult.status === 'fulfilled' ? newsResult.value : [];

    const currentPrice =
      panelPrice > 0 ? panelPrice : technical.currentPrice;

    const pnlPercent =
      cost > 0 && currentPrice > 0
        ? ((currentPrice - cost) / cost) * 100
        : null;

    const result = buildDecision({
      symbol,
      market,
      currentPrice,
      cost,
      quantity,
      pnlPercent,
      technical,
      news,
    });

    return Response.json(
      {
        ...result,
        generatedAt: new Date().toISOString(),
      },
      {
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      }
    );
  } catch (error) {
    console.error('Sky AI V1 hatası:', error);

    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Sky AI analiz hatası.',
      },
      { status: 500 }
    );
  }
}

async function getTechnicalData(symbol) {
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/` +
    `${encodeURIComponent(symbol)}?interval=1d&range=1y`;

  const response = await fetch(url, {
    cache: 'no-store',
    headers: {
      'User-Agent': 'Mozilla/5.0 Sky-Finans/1.0',
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Teknik veri servisi ${response.status} hatası verdi.`);
  }

  const data = await response.json();
  const result = data?.chart?.result?.[0];

  if (!result) {
    throw new Error('Hisse için fiyat geçmişi bulunamadı.');
  }

  const quote = result?.indicators?.quote?.[0] || {};
  const adjclose =
    result?.indicators?.adjclose?.[0]?.adjclose || [];

  const closes = (adjclose.length ? adjclose : quote.close || [])
    .map(Number)
    .filter(Number.isFinite);

  const highs = (quote.high || [])
    .map(Number)
    .filter(Number.isFinite);

  const lows = (quote.low || [])
    .map(Number)
    .filter(Number.isFinite);

  const volumes = (quote.volume || [])
    .map(Number)
    .filter(Number.isFinite);

  if (closes.length < 30) {
    throw new Error('Teknik analiz için yeterli günlük veri yok.');
  }

  const currentPrice = closes[closes.length - 1];
  const previousClose =
    closes.length > 1 ? closes[closes.length - 2] : currentPrice;

  const rsi14 = calculateRSI(closes, 14);
  const sma20 = SMA(closes, 20);
  const sma50 = SMA(closes, 50);
  const sma200 = SMA(closes, 200);

  const macdData = calculateMACD(closes);

  const recentLows = lows.slice(-20);
  const recentHighs = highs.slice(-20);

  const support =
    recentLows.length > 0 ? Math.min(...recentLows) : null;

  const resistance =
    recentHighs.length > 0 ? Math.max(...recentHighs) : null;

  const avgVolume20 =
    volumes.length >= 20
      ? volumes.slice(-20).reduce((a, b) => a + b, 0) / 20
      : null;

  const currentVolume =
    volumes.length > 0 ? volumes[volumes.length - 1] : null;

  const volumeRatio =
    avgVolume20 && currentVolume
      ? currentVolume / avgVolume20
      : null;

  return {
    currentPrice,
    previousClose,
    dailyChangePercent:
      previousClose > 0
        ? ((currentPrice - previousClose) / previousClose) * 100
        : 0,
    rsi14,
    sma20,
    sma50,
    sma200,
    macd: macdData.macd,
    macdSignal: macdData.signal,
    support,
    resistance,
    volumeRatio,
  };
}

function SMA(values, period) {
  if (!Array.isArray(values) || values.length < period) return null;

  const slice = values.slice(-period);

  return slice.reduce((sum, value) => sum + value, 0) / period;
}

function EMA(values, period) {
  if (!Array.isArray(values) || values.length < period) return [];

  const multiplier = 2 / (period + 1);
  const output = [];

  let previous =
    values.slice(0, period).reduce((a, b) => a + b, 0) / period;

  output.push(previous);

  for (let i = period; i < values.length; i++) {
    previous =
      (values[i] - previous) * multiplier + previous;

    output.push(previous);
  }

  return output;
}

function calculateRSI(values, period = 14) {
  if (!Array.isArray(values) || values.length <= period) return null;

  const changes = [];

  for (let i = 1; i < values.length; i++) {
    changes.push(values[i] - values[i - 1]);
  }

  const recent = changes.slice(-period);

  let gains = 0;
  let losses = 0;

  for (const change of recent) {
    if (change > 0) gains += change;
    if (change < 0) losses += Math.abs(change);
  }

  const avgGain = gains / period;
  const avgLoss = losses / period;

  if (avgLoss === 0) return 100;

  const rs = avgGain / avgLoss;

  return 100 - 100 / (1 + rs);
}

function calculateMACD(values) {
  const ema12 = EMA(values, 12);
  const ema26 = EMA(values, 26);

  if (!ema12.length || !ema26.length) {
    return { macd: null, signal: null };
  }

  const offset = ema12.length - ema26.length;

  const macdSeries = ema26.map(
    (value, index) => ema12[index + offset] - value
  );

  const signalSeries = EMA(macdSeries, 9);

  return {
    macd:
      macdSeries.length > 0
        ? macdSeries[macdSeries.length - 1]
        : null,
    signal:
      signalSeries.length > 0
        ? signalSeries[signalSeries.length - 1]
        : null,
  };
}

async function getNews(symbol) {
  const company = COMPANY_NAMES[symbol];

  const query = company
    ? `("${symbol}" OR "${company}") stock when:3d`
    : `"${symbol}" stock when:3d`;

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

  if (!response.ok) return [];

  const xml = await response.text();

  const blocks =
    xml.match(/<item>[\s\S]*?<\/item>/g) || [];

  return blocks
    .slice(0, 8)
    .map((block) => {
      const title = decodeXml(getTag(block, 'title'));
      const source = decodeXml(getTag(block, 'source'));

      return {
        title,
        source,
      };
    })
    .filter((item) => item.title);
}

function buildDecision({
  symbol,
  currentPrice,
  cost,
  quantity,
  pnlPercent,
  technical,
  news,
}) {
  let score = 0;
  const reasons = [];

  const rsi = technical.rsi14;

  if (Number.isFinite(rsi)) {
    if (rsi <= 30) {
      score += 2;
      reasons.push('RSI aşırı satım bölgesinde.');
    } else if (rsi <= 40) {
      score += 1;
      reasons.push('RSI zayıf bölgede ve tepki potansiyeli var.');
    } else if (rsi >= 70) {
      score -= 2;
      reasons.push('RSI aşırı alım bölgesinde.');
    } else if (rsi >= 60) {
      score -= 1;
      reasons.push('RSI kısa vadede yükselmiş durumda.');
    } else {
      reasons.push('RSI nötr bölgede.');
    }
  }

  if (Number.isFinite(technical.sma20)) {
    if (currentPrice >= technical.sma20) {
      score += 1;
      reasons.push('Fiyat 20 günlük ortalamanın üzerinde.');
    } else {
      score -= 1;
      reasons.push('Fiyat 20 günlük ortalamanın altında.');
    }
  }

  if (Number.isFinite(technical.sma50)) {
    if (currentPrice >= technical.sma50) {
      score += 1;
      reasons.push('Fiyat 50 günlük ortalamanın üzerinde.');
    } else {
      score -= 1;
      reasons.push('Fiyat 50 günlük ortalamanın altında.');
    }
  }

  if (Number.isFinite(technical.sma200)) {
    if (currentPrice >= technical.sma200) {
      score += 1;
      reasons.push('Uzun vadeli 200 günlük trendin üzerinde.');
    } else {
      score -= 1;
      reasons.push('Fiyat 200 günlük ortalamanın altında.');
    }
  }

  if (
    Number.isFinite(technical.macd) &&
    Number.isFinite(technical.macdSignal)
  ) {
    if (technical.macd >= technical.macdSignal) {
      score += 1;
      reasons.push('MACD sinyal çizgisinin üzerinde.');
    } else {
      score -= 1;
      reasons.push('MACD henüz pozitif teyit vermiyor.');
    }
  }

  if (
    Number.isFinite(technical.volumeRatio) &&
    technical.volumeRatio >= 1.3
  ) {
    if (technical.dailyChangePercent >= 0) {
      score += 0.5;
      reasons.push('Yükseliş yüksek hacimle destekleniyor.');
    } else {
      score -= 0.5;
      reasons.push('Düşüşte hacim ortalamanın üzerinde.');
    }
  }

  const positiveWords = [
    'beats',
    'beat estimates',
    'upgrade',
    'contract',
    'award',
    'partnership',
    'record revenue',
    'expands',
    'growth',
    'surge',
  ];

  const negativeWords = [
    'offering',
    'dilution',
    'downgrade',
    'lawsuit',
    'misses',
    'miss estimates',
    'bankruptcy',
    'delisting',
    'cuts guidance',
    'warning',
    'investigation',
  ];

  let positiveNews = 0;
  let negativeNews = 0;

  for (const item of news) {
    const title = String(item.title || '').toLowerCase();

    if (positiveWords.some((word) => title.includes(word))) {
      positiveNews += 1;
    }

    if (negativeWords.some((word) => title.includes(word))) {
      negativeNews += 1;
    }
  }

  if (positiveNews > negativeNews) {
    score += 1;
    reasons.push('Son haber başlıklarında pozitif unsurlar daha fazla.');
  } else if (negativeNews > positiveNews) {
    score -= 1;
    reasons.push('Son haber başlıklarında riskli/negatif unsurlar daha fazla.');
  } else if (news.length) {
    reasons.push('Son haber akışı belirgin biçimde pozitif veya negatif değil.');
  } else {
    reasons.push('Son 3 günde anlamlı haber başlığı bulunamadı.');
  }

  let decision = 'BEKLE';

  if (score >= 4) {
    decision = 'GÜÇLÜ EKLE';
  } else if (score >= 2) {
    decision = 'KADEMELİ EKLE';
  } else if (score >= 0) {
    decision = 'BEKLE';
  } else if (score > -3) {
    decision = 'ZAYIF — BEKLE';
  } else {
    decision = 'RİSK YÜKSEK';
  }

  const price = formatNumber(currentPrice);
  const support = formatNumber(technical.support);
  const resistance = formatNumber(technical.resistance);
  const rsiText = formatNumber(technical.rsi14);
  const sma20 = formatNumber(technical.sma20);
  const sma50 = formatNumber(technical.sma50);
  const sma200 = formatNumber(technical.sma200);

  const portfolioLine =
    cost > 0 && Number.isFinite(pnlPercent)
      ? `Maliyetin ${formatNumber(cost)}. Mevcut pozisyonun maliyetine göre %${Math.abs(
          pnlPercent
        ).toFixed(2)} ${pnlPercent >= 0 ? 'kârda' : 'zararda'}.`
      : '';

  const newsText =
    news.length > 0
      ? `Son 3 günde ${news.length} ilgili haber başlığı tarandı.`
      : 'Yakın tarihli haber başlığı bulunamadı.';

  const answer =
`${symbol} ANALİZİ — ${decision}

Güncel fiyat: ${price}
RSI(14): ${rsiText}
MA20: ${sma20}
MA50: ${sma50}
MA200: ${sma200}

Yakın destek: ${support}
Yakın direnç: ${resistance}

${portfolioLine}
${newsText}

Sky AI değerlendirmesi:
${reasons.slice(0, 6).map((x) => '• ' + x).join('\n')}

SONUÇ: ${decision}

Bu sonuç teknik göstergeler, mevcut pozisyonun ve haber başlıklarının birlikte değerlendirilmesidir; kesin alım/satım emri değildir.`;

  return {
    symbol,
    decision,
    score,
    answer,
    technical,
    news: news.slice(0, 5),
  };
}

function formatNumber(value) {
  return Number.isFinite(value)
    ? Number(value).toLocaleString('tr-TR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : '—';
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
    .replace(/&gt;/g, '>');
}
