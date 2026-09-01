import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import OpenAI from 'openai';
import {
  cert,
  getApps,
  initializeApp,
} from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const IMPORTANT_WORDS = [
  'bilanço',
  'finansal sonuç',
  'finansal rapor',
  'gelir',
  'kâr',
  'kar',
  'zarar',
  'earnings',
  'revenue',
  'profit',
  'loss',
  'sözleşme',
  'anlaşma',
  'ihale',
  'sipariş',
  'contract',
  'agreement',
  'order',
  'satın alma',
  'birleşme',
  'devralma',
  'acquisition',
  'merger',
  'yatırım',
  'tesis',
  'fabrika',
  'kapasite',
  'investment',
  'facility',
  'temettü',
  'dividend',
  'sermaye artırımı',
  'bedelli',
  'bedelsiz',
  'geri alım',
  'buyback',
  'dava',
  'soruşturma',
  'ceza',
  'investigation',
  'lawsuit',
  'penalty',
  'iflas',
  'konkordato',
  'bankruptcy',
  'borç',
  'kredi',
  'finansman',
  'debt',
  'financing',
  'onay',
  'ruhsat',
  'izin',
  'approval',
  'patent',
  'fda',
  'sec',
  'kap',
  'yönetim kurulu',
  'ceo',
  'istifa',
  'atama',
  'guidance',
  'hedef fiyat',
  'price target',
  'not artırımı',
  'not indirimi',
  'upgrade',
  'downgrade',
  'yükseldi',
  'yükseliş',
  'geriledi',
  'düştü',
  'düşüş',
  'arttı',
  'ralli',
  'rekor',
  'zirve',
  'fall',
  'falls',
  'drop',
  'drops',
  'slide',
  'slides',
  'decline',
  'declines',
  'plunge',
  'plummet',
  'selloff',
  'slump',
  'surge',
  'rally',
  'gain',
  'gains',
  'jump',
  'jumps',
  'rise',
  'rises',
  'down',
  'trade down',
];


const STOCK_NAME_ALIASES = {
  MU: ['Micron', 'Micron Technology'],
  AKBNK: ['Akbank'],
  ORZAX: ['Orzax'],
  ONDS: ['Ondas', 'Ondas Holdings'],
  EOSE: ['Eos Energy', 'Eos Energy Enterprises'],
  PGSUS: ['Pegasus', 'Pegasus Hava Yolları'],
  'CİTAS': ['Citas'],
  IREN: ['IREN Limited', 'Iris Energy'],
  CRWV: ['CoreWeave'],
  PLTR: ['Palantir', 'Palantir Technologies'],
  GARAN: ['Garanti BBVA', 'Türkiye Garanti Bankası'],
  TEM: ['Tempus AI'],
  NVDA: ['Nvidia', 'NVIDIA Corporation'],
  RKLB: ['Rocket Lab'],
  AMBA: ['Ambarella'],
  META: ['Meta Platforms', 'Facebook'],
  AAOI: ['Applied Optoelectronics'],
};

function getAdminApp() {
  if (getApps().length > 0) {
    return getApps()[0];
  }

  const encoded =
    process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;

  if (!encoded) {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT_BASE64 eksik.'
    );
  }

  const serviceAccount = JSON.parse(
    Buffer.from(encoded, 'base64').toString('utf8')
  );

  return initializeApp({
    credential: cert(serviceAccount),
  });
}

function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }

  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

function normalizeText(value) {
  return String(value || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9\s.-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsAlias(text, alias) {
  const cleanAlias = normalizeText(alias);
  if (!cleanAlias) return false;

  const pattern = new RegExp(
    `(^|[^a-z0-9])${escapeRegExp(cleanAlias)}(?=$|[^a-z0-9])`,
    'i'
  );

  return pattern.test(text);
}

function cleanCode(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/^(BIST|NASDAQ|NYSE|AMEX):/, '');
}

function createHashId(value) {
  return createHash('sha256')
    .update(String(value))
    .digest('hex')
    .slice(0, 48);
}

function getArticleArray(data) {
  if (Array.isArray(data)) return data;

  const candidates = [
    data?.news,
    data?.items,
    data?.articles,
    data?.results,
    data?.data,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }

  return [];
}

function normalizeArticle(item) {
  const title = String(
    item?.title ||
      item?.headline ||
      item?.name ||
      ''
  ).trim();

  const link = String(
    item?.link ||
      item?.url ||
      item?.href ||
      ''
  ).trim();

  const description = String(
    item?.description ||
      item?.summary ||
      item?.content ||
      item?.text ||
      ''
  ).trim();

  const publishedAt =
    item?.publishedAt ||
    item?.pubDate ||
    item?.date ||
    item?.createdAt ||
    item?.published ||
    null;

  const source =
    item?.source?.name ||
    item?.source ||
    item?.publisher ||
    '';

  return {
    title,
    link,
    description,
    publishedAt,
    source: String(source || ''),
  };
}

function isRecentArticle(article) {
  if (!article.publishedAt) {
    return true;
  }

  const timestamp = new Date(
    article.publishedAt
  ).getTime();

  if (!Number.isFinite(timestamp)) {
    return true;
  }

  const age = Date.now() - timestamp;
  const maxAge = 36 * 60 * 60 * 1000;

  return age >= 0 && age <= maxAge;
}

function getStockAliases(item) {
  const code = cleanCode(
    item.code ||
      item.symbol ||
      item.ticker ||
      item.id
  );

  const values = [
    code,
    ...(STOCK_NAME_ALIASES[code] || []),
    item.name,
    item.company,
    item.companyName,
    item.title,
  ];

  return [
    ...new Set(
      values
        .map(normalizeText)
        .filter((value) => value.length >= 1)
    ),
  ];
}

function findMatchedStock(article, stocks) {
  const articleText = normalizeText(
    `${article.title} ${article.description}`
  );

  for (const stock of stocks) {
    const matched = stock.aliases.some(
      (alias) => containsAlias(articleText, alias)
    );

    if (matched) {
      return stock;
    }
  }

  return null;
}

function getImportanceScore(article) {
  const text = normalizeText(
    `${article.title} ${article.description}`
  );

  let score = 0;

  for (const word of IMPORTANT_WORDS) {
    if (text.includes(normalizeText(word))) {
      score += 1;
    }
  }

  if (
    /son dakika|breaking|acil|önemli/.test(text)
  ) {
    score += 2;
  }

  return score;
}

function shorten(value, maxLength = 160) {
  const text = String(value || '')
    .replace(/\s+/g, ' ')
    .trim();

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 1)}…`;
}

function cleanTranslation(value) {
  return String(value || '')
    .replace(/^["'“”]+|["'“”]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function translateTitleWithOpenAI({
  openai,
  title,
}) {
  if (!openai) return null;

  try {
    const response = await openai.responses.create({
      model:
        process.env.OPENAI_ALERT_MODEL ||
        process.env.OPENAI_MODEL ||
        'gpt-5-mini',
      store: false,
      max_output_tokens: 90,
      instructions: [
        'Verilen finans haber başlığını doğal ve kısa Türkçeye çevir.',
        'Hisse kodlarını, şirket isimlerini, sayıları ve para birimlerini değiştirme.',
        'Yorum veya açıklama ekleme.',
        'Yalnızca çevrilmiş başlığı yaz.',
      ].join(' '),
      input: title,
    });

    const translated = cleanTranslation(
      response.output_text
    );

    return translated || null;
  } catch (error) {
    console.error(
      'OpenAI başlık çeviri hatası:',
      error?.message || error
    );
    return null;
  }
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
          'User-Agent': 'Mozilla/5.0 Sky-Finans/1.0',
        },
        signal: AbortSignal.timeout(8000),
      }
    );

    if (!response.ok) return null;

    const data = await response.json();
    const translated = cleanTranslation(
      Array.isArray(data?.[0])
        ? data[0]
            .map((part) => part?.[0] || '')
            .join('')
        : ''
    );

    return translated || null;
  } catch (error) {
    console.error(
      'Ücretsiz başlık çeviri hatası:',
      error?.message || error
    );
    return null;
  }
}

async function translateNewsTitle({
  openai,
  title,
  cache,
}) {
  const cacheKey = String(title || '').trim();

  if (!cacheKey) return '';
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  const translated =
    await translateTitleWithOpenAI({
      openai,
      title: cacheKey,
    }) ||
    await translateTitleFree(cacheKey) ||
    cacheKey;

  const result = shorten(translated, 190);
  cache.set(cacheKey, result);
  return result;
}

async function createSkyAiComment({
  openai,
  article,
  stock,
}) {
  if (!openai) {
    return null;
  }

  try {
    const response = await openai.responses.create({
      model:
        process.env.OPENAI_ALERT_MODEL ||
        process.env.OPENAI_MODEL ||
        'gpt-5-mini',
      store: false,
      max_output_tokens: 100,
      instructions: [
        'Sen Sky Finans haber alarmı asistanısın.',
        'Yalnızca verilen haber başlığı ve açıklamasını kullan.',
        'Bilmediğin bilgi ekleme ve kesin yatırım tavsiyesi verme.',
        'Türkçe, sade ve en fazla 150 karakterlik tek cümle yaz.',
        'Haberin yatırımcı açısından neden önemli olabileceğini belirt.',
        'Olumlu, olumsuz veya nötr tonu abartmadan ifade et.',
        'Başlık yetersizse "Detaylar açıklanmadan etkisi net değil." yaz.',
      ].join(' '),
      input: [
        `Hisse: ${stock.code}`,
        `Başlık: ${article.title}`,
        `Açıklama: ${article.description || 'Açıklama yok.'}`,
        `Kaynak: ${article.source || 'Belirtilmemiş'}`,
      ].join('\n'),
    });

    const comment = String(
      response.output_text || ''
    )
      .replace(/\s+/g, ' ')
      .trim();

    if (!comment) {
      return null;
    }

    return shorten(comment, 150);
  } catch (error) {
    console.error(
      `Sky AI yorum hatası (${stock.code}):`,
      error?.message || error
    );

    return null;
  }
}

async function fetchNews(baseUrl) {
  const response = await fetch(
    `${baseUrl}/api/news`,
    {
      method: 'GET',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
      },
    }
  );

  if (!response.ok) {
    throw new Error(
      `Haber servisi hatası: ${response.status}`
    );
  }

  const data = await response.json();

  return getArticleArray(data)
    .map(normalizeArticle)
    .filter(
      (article) =>
        article.title &&
        article.link &&
        isRecentArticle(article)
    );
}

async function readUserStocks(userRef) {
  const [portfolioSnapshot, watchlistSnapshot] =
    await Promise.all([
      userRef.collection('portfolio').get(),
      userRef.collection('watchlist').get(),
    ]);

  const documents = [
    ...portfolioSnapshot.docs,
    ...watchlistSnapshot.docs,
  ];

  const stocks = documents
    .map((document) => ({
      id: document.id,
      ...document.data(),
    }))
    .map((item) => {
      const code = cleanCode(
        item.code ||
          item.symbol ||
          item.ticker ||
          item.id
      );

      return {
        code,
        aliases: getStockAliases({
          ...item,
          code,
        }),
      };
    })
    .filter(
      (stock) =>
        stock.code &&
        stock.aliases.length > 0
    );

  const unique = new Map();

  for (const stock of stocks) {
    if (!unique.has(stock.code)) {
      unique.set(stock.code, stock);
    }
  }

  return [...unique.values()];
}

async function processUser({
  userDoc,
  messaging,
  articles,
  baseUrl,
  openai,
  translationCache,
}) {
  const userRef = userDoc.ref;

  const [stocks, deviceSnapshot] =
    await Promise.all([
      readUserStocks(userRef),
      userRef
        .collection('notificationDevices')
        .where('enabled', '==', true)
        .get(),
    ]);

  const tokens = [
    ...new Set(
      deviceSnapshot.docs
        .map(
          (document) =>
            document.data()?.token
        )
        .filter(Boolean)
    ),
  ];

  if (stocks.length === 0) {
    return {
      matched: 0,
      sent: 0,
      aiComments: 0,
      translations: 0,
    };
  }

  const candidates = articles
    .map((article) => {
      const stock = findMatchedStock(
        article,
        stocks
      );

      return {
        article,
        stock,
        score: getImportanceScore(article),
      };
    })
    .filter(
      (candidate) =>
        candidate.stock &&
        candidate.score > 0
    )
    .sort((a, b) => b.score - a.score);

  let sent = 0;
  let matched = 0;
  let aiComments = 0;
  let translations = 0;
  let processed = 0;

  for (const candidate of candidates) {
    if (processed >= 3) {
      break;
    }

    matched += 1;

    const { article, stock } = candidate;

    const historyId = createHashId(
      `${article.link}|${article.title}`
    );

    const historyRef = userRef
      .collection('newsAlertHistory')
      .doc(historyId);

    const historySnapshot =
      await historyRef.get();

    if (
      historySnapshot.exists &&
      Number(historySnapshot.data()?.successCount) > 0
    ) {
      continue;
    }

    const aiComment =
      await createSkyAiComment({
        openai,
        article,
        stock,
      });

    if (aiComment) {
      aiComments += 1;
    }

    const translatedTitle =
      await translateNewsTitle({
        openai,
        title: article.title,
        cache: translationCache,
      });

    if (translatedTitle !== article.title) {
      translations += 1;
    }

    const title =
      `📰 ${stock.code} önemli haber`;

    const body = aiComment
      ? shorten(
          `${translatedTitle} — Sky AI: ${aiComment}`,
          220
        )
      : translatedTitle;

    const targetUrl =
      article.link ||
      `${baseUrl}/senkron-panel`;

    const inboxRef = userRef
      .collection('notifications')
      .doc(`news_${historyId}`);

    if (!(await inboxRef.get()).exists) {
      await inboxRef.set({
        title,
        body,
        type: 'news-ai',
        url: targetUrl,
        symbol: stock.code,
        source: article.source || null,
        publishedAt: article.publishedAt || null,
        read: false,
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    const result = tokens.length
      ? await messaging.sendEachForMulticast({
        tokens,
        notification: {
          title,
          body,
        },
        data: {
          url: targetUrl,
          symbol: stock.code,
          type: 'news-ai',
          newsTitle: translatedTitle,
          originalNewsTitle: article.title,
          newsUrl: article.link,
          aiComment: aiComment || '',
        },
        webpush: {
          headers: {
            Urgency: 'high',
            TTL: '3600',
          },
          fcmOptions: {
            link: targetUrl,
          },
          notification: {
            icon: '/icon-192.png',
            badge: '/icon-192.png',
            tag: historyId,
          },
        },
      })
      : { successCount: 0, failureCount: 0 };

    if (result.successCount > 0) {
      await historyRef.set({
      symbol: stock.code,
      title: article.title,
      translatedTitle,
      link: article.link,
      source: article.source,
      publishedAt:
        article.publishedAt || null,
      importanceScore: candidate.score,
      aiComment: aiComment || null,
      aiModel:
        aiComment
          ? (
              process.env.OPENAI_ALERT_MODEL ||
              process.env.OPENAI_MODEL ||
              'gpt-5-mini'
            )
          : null,
      successCount: result.successCount,
      failureCount: result.failureCount,
      sentAt: new Date().toISOString(),
      });
    }

    sent += result.successCount;
    processed += 1;
  }

  return {
    matched,
    sent,
    aiComments,
    translations,
  };
}

export async function GET(request) {
  try {
    const authHeader =
      request.headers.get('authorization');

    const expected =
      process.env.ALERT_CRON_SECRET;

    if (
      !expected ||
      authHeader !== `Bearer ${expected}`
    ) {
      return NextResponse.json(
        {
          error: 'Yetkisiz erişim.',
        },
        {
          status: 401,
        }
      );
    }

    const baseUrl =
      process.env.APP_URL ||
      'https://finans-paneli-amber.vercel.app';

    getAdminApp();

    const adminDb = getFirestore();
    const messaging = getMessaging();
    const openai = getOpenAIClient();

    const [usersSnapshot, articles] =
      await Promise.all([
        adminDb.collection('users').get(),
        fetchNews(baseUrl),
      ]);

    const debugMode =
      new URL(request.url).searchParams.get('debug') === '1';

    if (debugMode) {
      const users = [];

      for (const [index, userDoc] of usersSnapshot.docs.entries()) {
        const stocks = await readUserStocks(userDoc.ref);

        const matches = articles
          .map((article) => {
            const stock = findMatchedStock(article, stocks);
            if (!stock) return null;

            const score = getImportanceScore(article);

            return {
              symbol: stock.code,
              title: article.title,
              score,
              accepted: score > 0,
            };
          })
          .filter(Boolean);

        users.push({
          user: index + 1,
          stocks: stocks.map((stock) => stock.code),
          matches,
        });
      }

      return NextResponse.json({
        ok: true,
        debug: true,
        articleCount: articles.length,
        users,
      });
    }

    let totalMatched = 0;
    let totalSent = 0;
    let totalAiComments = 0;
    let totalTranslations = 0;
    const translationCache = new Map();

    for (const userDoc of usersSnapshot.docs) {
      const result = await processUser({
        userDoc,
        messaging,
        articles,
        baseUrl,
        openai,
        translationCache,
      });

      totalMatched += result.matched;
      totalSent += result.sent;
      totalAiComments += result.aiComments;
      totalTranslations += result.translations;
    }

    return NextResponse.json({
      ok: true,
      version: 'news-alerts-tr-v2',
      aiEnabled: Boolean(openai),
      users: usersSnapshot.size,
      articles: articles.length,
      matched: totalMatched,
      sent: totalSent,
      aiComments: totalAiComments,
      translations: totalTranslations,
    });
  } catch (error) {
    console.error(
      'Sky AI haber alarmı hatası:',
      error
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          error?.message ||
          'Haber alarmı başarısız.',
      },
      {
        status: 500,
      }
    );
  }
}
