import { NextResponse } from 'next/server';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 60;

const COLLECTION = 'futureSectorReports';
const VERSION = 'future-sectors-rule-based-v1';
const DAY_MS = 24 * 60 * 60 * 1000;

const SECTORS = [
  {
    id: 'humanoid-robotics',
    name: 'Humanoid Robotlar ve Robotik',
    shortName: 'Robotik',
    icon: '🤖',
    color: '#34d399',
    ticker: 'BOTZ',
    symbols: ['BOTZ', 'ROBO', 'NVDA', 'TSLA', 'TER', 'GOOGL'],
    query:
      '(humanoid robot OR industrial robotics OR autonomous robot OR robot automation) investment when:30d',
    thesis:
      'Yapay zekânın fiziksel dünyaya taşınması; üretim, lojistik ve hizmet robotlarında uzun vadeli verimlilik artışı sağlayabilir.',
    structuralDrivers: [
      'İş gücü açığı ve artan otomasyon ihtiyacı',
      'Yapay zekâ modellerinin robotlara uyarlanması',
      'Sensör, çip ve batarya maliyetlerinin düşmesi',
    ],
    risks: [
      'Ticarileşmenin beklenenden uzun sürmesi',
      'Yüksek değerlemeler ve yoğun sermaye ihtiyacı',
      'Güvenlik ve düzenleyici sınırlamalar',
    ],
  },
  {
    id: 'ai-infrastructure',
    name: 'Yapay Zekâ ve Veri Altyapısı',
    shortName: 'Yapay Zekâ',
    icon: '◈',
    color: '#60a5fa',
    ticker: 'AIQ',
    symbols: ['AIQ', 'NVDA', 'MSFT', 'GOOGL', 'AMZN', 'ORCL'],
    query:
      '(artificial intelligence infrastructure OR AI data center OR generative AI enterprise) investment when:30d',
    thesis:
      'Model geliştirme, veri merkezi, bulut ve kurumsal yazılım harcamaları yapay zekâ ekosisteminin temel büyüme motorlarıdır.',
    structuralDrivers: [
      'Şirketlerin yapay zekâ yatırımlarını artırması',
      'Veri merkezi ve hızlandırıcı talebi',
      'Kurumsal iş akışlarında otomasyon',
    ],
    risks: [
      'Yatırım harcamalarının gelire dönüşmesinde gecikme',
      'Yoğun rekabet ve fiyat baskısı',
      'Enerji kapasitesi ve düzenleme sorunları',
    ],
  },
  {
    id: 'semiconductors',
    name: 'Yarı İletkenler ve İleri Çipler',
    shortName: 'Çipler',
    icon: '▦',
    color: '#f5dc7d',
    ticker: 'SOXX',
    symbols: ['SOXX', 'SMH', 'NVDA', 'AVGO', 'AMD', 'TSM', 'ASML'],
    query:
      '(semiconductor OR advanced chip OR AI accelerator OR chip equipment) investment when:30d',
    thesis:
      'Yapay zekâ, otomotiv, savunma ve bağlı cihazlar daha yüksek hesaplama gücü ve ileri üretim ekipmanı gerektiriyor.',
    structuralDrivers: [
      'AI hızlandırıcı ve bellek talebi',
      'Yeni üretim kapasitesi yatırımları',
      'Otomotiv ve endüstriyel çip büyümesi',
    ],
    risks: [
      'Çip döngüsünde arz fazlası',
      'Jeopolitik ve ihracat kısıtlamaları',
      'Yüksek değerleme oynaklığı',
    ],
  },
  {
    id: 'biotech-health',
    name: 'Biyoteknoloji ve Yeni Nesil Sağlık',
    shortName: 'Biyoteknoloji',
    icon: '✚',
    color: '#a78bfa',
    ticker: 'XBI',
    symbols: ['XBI', 'IBB', 'VRTX', 'REGN', 'CRSP', 'RXRX'],
    query:
      '(biotechnology OR gene editing OR precision medicine OR AI drug discovery) investment when:30d',
    thesis:
      'Gen düzenleme, kişiselleştirilmiş tedavi ve yapay zekâ destekli ilaç keşfi sağlık sektöründe yeni ürün döngüleri oluşturabilir.',
    structuralDrivers: [
      'Yeni ilaç platformları ve klinik başarılar',
      'Yaşlanan nüfus ve artan sağlık harcaması',
      'AI destekli ilaç geliştirme süreçleri',
    ],
    risks: [
      'Klinik deney ve FDA başarısızlığı',
      'Finansman ihtiyacı ve nakit tüketimi',
      'Patent ve fiyatlandırma baskısı',
    ],
  },
  {
    id: 'power-grid',
    name: 'Elektrik, Enerji ve Şebeke Altyapısı',
    shortName: 'Enerji Altyapısı',
    icon: 'ϟ',
    color: '#fb923c',
    ticker: 'GRID',
    symbols: ['GRID', 'XLU', 'PAVE', 'VST', 'CEG', 'ETN'],
    query:
      '(power grid investment OR electricity demand data center OR grid modernization OR energy infrastructure) when:30d',
    thesis:
      'Veri merkezleri, elektrifikasyon ve yenilenen üretim kapasitesi; şebeke, ekipman ve enerji arzı yatırımlarını hızlandırabilir.',
    structuralDrivers: [
      'Veri merkezlerinin elektrik talebi',
      'Şebeke modernizasyonu ve depolama',
      'Sanayi ve ulaşımda elektrifikasyon',
    ],
    risks: [
      'Faiz ve proje finansmanı maliyetleri',
      'İzin süreçleri ve kapasite gecikmeleri',
      'Emtia fiyatı ve politika değişimleri',
    ],
  },
  {
    id: 'cybersecurity',
    name: 'Siber Güvenlik',
    shortName: 'Siber Güvenlik',
    icon: '◆',
    color: '#22d3ee',
    ticker: 'CIBR',
    symbols: ['CIBR', 'HACK', 'CRWD', 'PANW', 'FTNT', 'ZS'],
    query:
      '(cybersecurity spending OR cloud security OR AI cybersecurity OR data breach) investment when:30d',
    thesis:
      'Dijitalleşme ve yapay zekâ destekli saldırılar, güvenlik harcamalarını isteğe bağlı olmaktan çıkarıp zorunlu altyapıya dönüştürüyor.',
    structuralDrivers: [
      'Artan saldırı sıklığı ve maliyeti',
      'Bulut ve kimlik güvenliği talebi',
      'Düzenleyici güvenlik zorunlulukları',
    ],
    risks: [
      'Yoğun rekabet ve ürün birleştirmeleri',
      'Yüksek satış ve pazarlama giderleri',
      'Değerleme çarpanlarında daralma',
    ],
  },
  {
    id: 'space-economy',
    name: 'Uzay Ekonomisi ve Uydu Teknolojileri',
    shortName: 'Uzay',
    icon: '◎',
    color: '#f472b6',
    ticker: 'UFO',
    symbols: ['UFO', 'ARKX', 'RKLB', 'LUNR', 'PL', 'RDW'],
    query:
      '(space economy OR satellite communications OR commercial space OR rocket launch) investment when:30d',
    thesis:
      'Düşen fırlatma maliyetleri, uydu iletişimi ve kamu savunma harcamaları yeni bir ticari uzay ekosistemi oluşturuyor.',
    structuralDrivers: [
      'Uydu interneti ve dünya gözlem talebi',
      'Savunma ve kamu sözleşmeleri',
      'Düşen fırlatma ve donanım maliyetleri',
    ],
    risks: [
      'Erken aşama şirketlerde yüksek nakit tüketimi',
      'Fırlatma gecikmeleri ve teknik başarısızlık',
      'Sözleşme ve finansman yoğunlaşması',
    ],
  },
];

const POSITIVE_WORDS = [
  'growth', 'record', 'approval', 'contract', 'investment', 'expansion',
  'demand', 'breakthrough', 'partnership', 'funding', 'profit', 'surge',
  'advance', 'launch', 'adoption', 'upgrade', 'outperform',
];

const RISK_WORDS = [
  'delay', 'loss', 'cut', 'warning', 'risk', 'probe', 'lawsuit', 'ban',
  'decline', 'shortage', 'fail', 'concern', 'layoff', 'downgrade',
];

function getAdminApp() {
  if (getApps().length) return getApps()[0];

  const encoded = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (!encoded) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_BASE64 eksik.');
  }

  return initializeApp({
    credential: cert(
      JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'))
    ),
  });
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function monthKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
  })
    .format(date)
    .slice(0, 7);
}

function monthLabel(date = new Date()) {
  return new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'Europe/Istanbul',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function normalizeTitle(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9çğıöşü]+/gi, ' ')
    .trim();
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

function getTag(block, tag) {
  const match = block.match(
    new RegExp(
      `<${tag}(?:\\s[^>]*)?>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`,
      'i'
    )
  );
  return match ? match[1].trim() : '';
}

async function fetchNews(sector) {
  const url =
    'https://news.google.com/rss/search?' +
    new URLSearchParams({
      q: sector.query,
      hl: 'en-US',
      gl: 'US',
      ceid: 'US:en',
    }).toString();

  const response = await fetch(url, {
    cache: 'no-store',
    headers: {
      Accept: 'application/rss+xml, application/xml, text/xml',
      'User-Agent': 'Mozilla/5.0 Sky-Finans-Future-Sectors/1.0',
    },
    signal: AbortSignal.timeout(12000),
  });

  if (!response.ok) {
    throw new Error(`${sector.shortName} haber akışı: ${response.status}`);
  }

  const blocks = (await response.text()).match(/<item>[\s\S]*?<\/item>/g) || [];
  const earliest = Date.now() - 32 * DAY_MS;
  const items = [];
  const seen = new Set();

  for (const block of blocks) {
    const rawTitle = decodeXml(getTag(block, 'title'));
    const parts = rawTitle.split(' - ');
    const sourceTag = decodeXml(getTag(block, 'source'));
    const source = sourceTag || (parts.length > 1 ? parts.pop() : '');
    const title = parts.join(' - ').trim() || rawTitle;
    const publishedAt = new Date(decodeXml(getTag(block, 'pubDate')));
    const key = normalizeTitle(title);

    if (
      !title ||
      !key ||
      seen.has(key) ||
      Number.isNaN(publishedAt.getTime()) ||
      publishedAt.getTime() < earliest
    ) {
      continue;
    }

    seen.add(key);
    items.push({
      title,
      source: source.trim() || 'Kaynak belirtilmedi',
      link: decodeXml(getTag(block, 'link')),
      publishedAt: publishedAt.toISOString(),
    });

    if (items.length >= 12) break;
  }

  return items;
}

async function fetchMarketSeries(ticker) {
  const period2 = Math.floor(Date.now() / 1000);
  const period1 = period2 - 220 * 24 * 60 * 60;
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}` +
    `?period1=${period1}&period2=${period2}&interval=1d&events=history`;

  const response = await fetch(url, {
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Mozilla/5.0 Sky-Finans-Future-Sectors/1.0',
    },
    signal: AbortSignal.timeout(12000),
  });

  if (!response.ok) throw new Error(`${ticker} fiyatı: ${response.status}`);

  const data = await response.json();
  const result = data?.chart?.result?.[0];
  const timestamps = result?.timestamp || [];
  const closes = result?.indicators?.quote?.[0]?.close || [];
  const points = timestamps
    .map((time, index) => ({ time: time * 1000, close: Number(closes[index]) }))
    .filter((point) => Number.isFinite(point.close) && point.close > 0);

  if (points.length < 25) throw new Error(`${ticker} için yeterli fiyat yok.`);
  return points;
}

function returnForDays(points, days) {
  const latest = points.at(-1);
  const targetTime = latest.time - days * DAY_MS;
  let start = points[0];

  for (const point of points) {
    if (point.time <= targetTime) start = point;
    else break;
  }

  return round(((latest.close / start.close) - 1) * 100);
}

function keywordBalance(news) {
  const text = news.map((item) => item.title.toLowerCase()).join(' ');
  const positives = POSITIVE_WORDS.reduce(
    (total, word) => total + (text.includes(word) ? 1 : 0),
    0
  );
  const risks = RISK_WORDS.reduce(
    (total, word) => total + (text.includes(word) ? 1 : 0),
    0
  );
  return { positives, risks };
}

function scoreSector(sector, news, market, qqqMarket) {
  const sources = new Set(news.map((item) => item.source).filter(Boolean));
  const balance = keywordBalance(news);
  const oneMonth = returnForDays(market, 30);
  const threeMonth = returnForDays(market, 90);
  const qqqOneMonth = returnForDays(qqqMarket, 30);
  const qqqThreeMonth = returnForDays(qqqMarket, 90);
  const relativeOneMonth = round(oneMonth - qqqOneMonth);
  const relativeThreeMonth = round(threeMonth - qqqThreeMonth);

  const marketPoints =
    clamp(oneMonth * 0.7, -10, 10) +
    clamp(threeMonth * 0.45, -12, 12) +
    clamp(relativeOneMonth * 0.65, -8, 8) +
    clamp(relativeThreeMonth * 0.45, -9, 9);
  const attentionPoints = clamp(news.length * 0.9, 0, 9);
  const sourcePoints = clamp(sources.size * 0.8, 0, 7);
  const catalystPoints = clamp(balance.positives * 1.1, 0, 8);
  const riskPenalty = clamp(balance.risks * 0.9, 0, 7);
  const score = Math.round(
    clamp(50 + marketPoints + attentionPoints + sourcePoints + catalystPoints - riskPenalty, 18, 96)
  );

  let signal = 'İZLE';
  if (score >= 76) signal = 'GÜÇLÜ ADAY';
  else if (score >= 62) signal = 'OLUMLU';
  else if (score < 45) signal = 'ZAYIF';

  return {
    ...sector,
    score,
    signal,
    oneMonth,
    threeMonth,
    relativeOneMonth,
    relativeThreeMonth,
    newsCount: news.length,
    sourceCount: sources.size,
    positiveSignals: balance.positives,
    riskSignals: balance.risks,
    lastPrice: round(market.at(-1).close),
    news: news.slice(0, 6),
  };
}

function buildArticle(ranking, label) {
  const leaders = ranking.slice(0, 3);
  const leaderNames = leaders.map((item) => item.shortName).join(', ');
  const strongest = leaders[0];
  const cautious = [...ranking].sort((a, b) => a.score - b.score)[0];

  return {
    title: `${label}: Geleceğin sektörlerinde güç nerede birikiyor?`,
    intro:
      `Bu ayın ücretsiz akıllı taramasında ${ranking.length} uzun vadeli tema incelendi. ` +
      `Piyasa momentumu, QQQ'ya göre göreceli güç, haber yoğunluğu ve kaynak çeşitliliği birlikte değerlendirildi. ` +
      `Öne çıkan ilk üç alan ${leaderNames} oldu.`,
    paragraphs: [
      `${strongest.name}, ${strongest.score}/100 puanla ayın en güçlü temasıdır. ` +
        `Sektör göstergesi son bir ayda %${strongest.oneMonth >= 0 ? '+' : ''}${strongest.oneMonth}, ` +
        `son üç ayda %${strongest.threeMonth >= 0 ? '+' : ''}${strongest.threeMonth} değişti. ` +
        `Aynı dönemde QQQ'ya göre üç aylık farkı %${strongest.relativeThreeMonth >= 0 ? '+' : ''}${strongest.relativeThreeMonth} oldu.`,
      `Haber tarafında ${strongest.newsCount} güncel içerik ve ${strongest.sourceCount} farklı kaynak görüldü. ` +
        `Bu yoğunluk tek başına yatırım sinyali değildir; fiyat gücüyle birlikte sektör ilgisinin devam edip etmediğini anlamaya yardımcı olur.`,
      `${cautious.name}, ${cautious.score}/100 puanla bu ay daha temkinli izlenmesi gereken alandır. ` +
        `Zayıf göreceli güç veya artan risk başlıkları kalıcı bir bozulma anlamına gelmeyebilir; ancak yeni alım kararı öncesinde teyit gerektirir.`,
      `Bu raporun amacı geleceği kesin biçimde tahmin etmek değil, değişen sermaye akışını ve yapısal büyüme temalarını aynı ölçekte karşılaştırmaktır. ` +
        `Aylık sonuçlar tek başına değil; değerleme, bilanço kalitesi ve kişisel risk planıyla birlikte değerlendirilmelidir.`,
    ],
  };
}

async function generateReport() {
  const qqqPromise = fetchMarketSeries('QQQ');
  const sectorResults = await Promise.allSettled(
    SECTORS.map(async (sector) => {
      const [newsResult, marketResult] = await Promise.allSettled([
        fetchNews(sector),
        fetchMarketSeries(sector.ticker),
      ]);

      if (marketResult.status !== 'fulfilled') {
        throw marketResult.reason;
      }

      return {
        sector,
        news: newsResult.status === 'fulfilled' ? newsResult.value : [],
        market: marketResult.value,
        warning:
          newsResult.status === 'rejected'
            ? String(newsResult.reason?.message || 'Haberler alınamadı.')
            : null,
      };
    })
  );
  const qqqMarket = await qqqPromise;
  const warnings = [];
  const ranking = [];

  for (const result of sectorResults) {
    if (result.status === 'rejected') {
      warnings.push(String(result.reason?.message || 'Sektör verisi alınamadı.'));
      continue;
    }

    if (result.value.warning) warnings.push(result.value.warning);
    ranking.push(
      scoreSector(
        result.value.sector,
        result.value.news,
        result.value.market,
        qqqMarket
      )
    );
  }

  if (ranking.length < 4) {
    throw new Error('Sağlıklı rapor için yeterli sektör verisi alınamadı.');
  }

  ranking.sort((a, b) => b.score - a.score);
  const generatedAt = new Date().toISOString();
  const label = monthLabel(new Date());

  return {
    ok: true,
    version: VERSION,
    id: monthKey(new Date()),
    monthKey: monthKey(new Date()),
    monthLabel: label,
    generatedAt,
    benchmark: {
      ticker: 'QQQ',
      oneMonth: returnForDays(qqqMarket, 30),
      threeMonth: returnForDays(qqqMarket, 90),
    },
    methodology:
      'Puan; 1 ve 3 aylık sektör ETF performansı, QQQ göreceli gücü, son 30 günlük haber yoğunluğu, kaynak çeşitliliği ve başlıklardaki katalizör/risk ifadelerinden hesaplanır.',
    ranking,
    article: buildArticle(ranking, label),
    warnings: warnings.slice(0, 8),
  };
}

export async function GET(request) {
  try {
    getAdminApp();
    const { searchParams } = new URL(request.url);
    const limit = clamp(Number(searchParams.get('limit') || 12), 1, 24);
    const snapshot = await getFirestore().collection(COLLECTION).get();
    const reports = snapshot.docs
      .map((document) => ({ id: document.id, ...document.data() }))
      .sort((a, b) => String(b.generatedAt).localeCompare(String(a.generatedAt)))
      .slice(0, limit);

    return NextResponse.json(
      { ok: true, reports },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch (error) {
    console.error('Geleceğin sektörleri okuma hatası:', error);
    return NextResponse.json(
      { ok: false, reports: [], error: error?.message || 'Raporlar alınamadı.' },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const expected = process.env.ALERT_CRON_SECRET;
    if (!expected || request.headers.get('authorization') !== `Bearer ${expected}`) {
      return NextResponse.json({ ok: false, error: 'Yetkisiz erişim.' }, { status: 401 });
    }

    getAdminApp();
    const report = await generateReport();
    await getFirestore()
      .collection(COLLECTION)
      .doc(report.monthKey)
      .set(report, { merge: false });

    return NextResponse.json(report, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  } catch (error) {
    console.error('Geleceğin sektörleri üretim hatası:', error);
    return NextResponse.json(
      { ok: false, error: error?.message || 'Aylık rapor üretilemedi.' },
      { status: 500 }
    );
  }
}
