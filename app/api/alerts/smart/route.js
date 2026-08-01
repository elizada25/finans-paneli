import { NextResponse } from 'next/server';
import {
  cert,
  getApps,
  initializeApp,
} from 'firebase-admin/app';
import {
  getFirestore,
  FieldValue,
} from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

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

function numberValue(...values) {
  for (const value of values) {
    const parsed = Number(value);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function normalizeCode(item) {
  return String(
    item.code ||
      item.symbol ||
      item.ticker ||
      item.stockCode ||
      item.id ||
      ''
  )
    .trim()
    .toUpperCase()
    .replace(/^(BIST|NASDAQ|NYSE|AMEX):/, '');
}

function normalizeMarket(item) {
  const raw = String(
    item.market ||
      item.exchange ||
      item.region ||
      item.currency ||
      ''
  ).toUpperCase();

  if (
    raw.includes('NASDAQ') ||
    raw.includes('NYSE') ||
    raw.includes('AMEX') ||
    raw.includes('US') ||
    raw.includes('USD') ||
    raw.includes('AMERICA')
  ) {
    return 'NASDAQ';
  }

  return 'BIST';
}

function getQuantity(item) {
  return (
    numberValue(
      item.quantity,
      item.lot,
      item.lots,
      item.shares,
      item.amount,
      item.adet
    ) || 0
  );
}

function getIstanbulDateKey() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function formatMoney(value, market) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return '-';
  }

  if (market === 'NASDAQ') {
    return `${number.toLocaleString('tr-TR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} USD`;
  }

  return `${number.toLocaleString('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} TL`;
}

function signedPercent(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return '-';
  }

  return `${number > 0 ? '+' : ''}${number.toFixed(2)}%`;
}

async function fetchPrices(baseUrl, market, codes) {
  const uniqueCodes = [...new Set(codes.filter(Boolean))];

  if (uniqueCodes.length === 0) {
    return {};
  }

  const response = await fetch(
    `${baseUrl}/api/prices`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
      body: JSON.stringify({
        market,
        codes: uniqueCodes,
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(
      `${market} fiyat servisi hatası: ` +
        `${response.status} ${errorText.slice(0, 160)}`
    );
  }

  const data = await response.json();

  return data?.prices || {};
}

async function sendNotification({
  messaging,
  tokens,
  title,
  body,
  baseUrl,
  data = {},
}) {
  if (tokens.length === 0) {
    return {
      successCount: 0,
      failureCount: 0,
    };
  }

  return messaging.sendEachForMulticast({
    tokens,
    notification: {
      title,
      body,
    },
    data: {
      url: '/senkron-panel',
      ...Object.fromEntries(
        Object.entries(data).map(([key, value]) => [
          key,
          String(value ?? ''),
        ])
      ),
    },
    webpush: {
      fcmOptions: {
        link: `${baseUrl}/senkron-panel`,
      },
      notification: {
        icon: '/icon-192.png',
        badge: '/icon-192.png',
      },
    },
  });
}

async function sendOncePerDay({
  historyRef,
  messaging,
  tokens,
  title,
  body,
  baseUrl,
  details,
}) {
  const existing = await historyRef.get();

  if (existing.exists) {
    return {
      skipped: true,
      successCount: 0,
      failureCount: 0,
    };
  }

  const result = await sendNotification({
    messaging,
    tokens,
    title,
    body,
    baseUrl,
    data: details,
  });

  await historyRef.set({
    ...details,
    title,
    body,
    sentAt: FieldValue.serverTimestamp(),
    successCount: result.successCount,
    failureCount: result.failureCount,
  });

  return {
    skipped: false,
    successCount: result.successCount,
    failureCount: result.failureCount,
  };
}

function getVolumeRatio(quote) {
  const volume = numberValue(
    quote.volume,
    quote.regularMarketVolume,
    quote.currentVolume
  );

  const averageVolume = numberValue(
    quote.averageVolume,
    quote.avgVolume,
    quote.averageDailyVolume10Day,
    quote.averageDailyVolume3Month
  );

  if (
    !volume ||
    !averageVolume ||
    averageVolume <= 0
  ) {
    return null;
  }

  return volume / averageVolume;
}

function getTechnicalSignal(quote) {
  const price = numberValue(
    quote.price,
    quote.last,
    quote.regularMarketPrice
  );

  const high52 = numberValue(
    quote.high52,
    quote.fiftyTwoWeekHigh,
    quote.week52High
  );

  const low52 = numberValue(
    quote.low52,
    quote.fiftyTwoWeekLow,
    quote.week52Low
  );

  if (!price) {
    return null;
  }

  if (
    high52 &&
    high52 > 0 &&
    price >= high52 * 0.995
  ) {
    return {
      type: '52w-high',
      level: high52,
      titleSuffix: '52 haftalık zirve alarmı',
      text:
        `Son fiyat ${price.toFixed(2)}, ` +
        `52 haftalık zirve ${high52.toFixed(2)}.`,
    };
  }

  if (
    low52 &&
    low52 > 0 &&
    price <= low52 * 1.005
  ) {
    return {
      type: '52w-low',
      level: low52,
      titleSuffix: '52 haftalık dip alarmı',
      text:
        `Son fiyat ${price.toFixed(2)}, ` +
        `52 haftalık dip ${low52.toFixed(2)}.`,
    };
  }

  return null;
}

async function processUser({
  userDoc,
  messaging,
  baseUrl,
  dateKey,
}) {
  const userRef = userDoc.ref;

  const [
    portfolioSnapshot,
    deviceSnapshot,
  ] = await Promise.all([
    userRef.collection('portfolio').get(),
    userRef
      .collection('notificationDevices')
      .where('enabled', '==', true)
      .get(),
  ]);

  const tokens = [
    ...new Set(
      deviceSnapshot.docs
        .map((document) => document.data()?.token)
        .filter(Boolean)
    ),
  ];

  if (
    portfolioSnapshot.empty ||
    tokens.length === 0
  ) {
    return {
      stocks: 0,
      sent: 0,
    };
  }

  const stocks = portfolioSnapshot.docs
    .map((document) => ({
      id: document.id,
      ...document.data(),
    }))
    .map((item) => ({
      ...item,
      code: normalizeCode(item),
      market: normalizeMarket(item),
      quantity: getQuantity(item),
    }))
    .filter((item) => item.code);

  const bistCodes = stocks
    .filter((item) => item.market === 'BIST')
    .map((item) => item.code);

  const nasdaqCodes = stocks
    .filter((item) => item.market === 'NASDAQ')
    .map((item) => item.code);

  const [bistPrices, nasdaqPrices] =
    await Promise.all([
      fetchPrices(baseUrl, 'BIST', bistCodes),
      fetchPrices(baseUrl, 'NASDAQ', nasdaqCodes),
    ]);

  let totalSent = 0;

  const portfolioTotals = {
    BIST: {
      currentValue: 0,
      previousValue: 0,
      dailyChange: 0,
    },
    NASDAQ: {
      currentValue: 0,
      previousValue: 0,
      dailyChange: 0,
    },
  };

  for (const stock of stocks) {
    const priceMap =
      stock.market === 'NASDAQ'
        ? nasdaqPrices
        : bistPrices;

    const quote = priceMap?.[stock.code];

    if (!quote) {
      continue;
    }

    const price = numberValue(
      quote.price,
      quote.last,
      quote.regularMarketPrice
    );

    const previousClose = numberValue(
      quote.previousClose,
      quote.prevClose,
      quote.regularMarketPreviousClose
    );

    const changePercent = numberValue(
      quote.changePercent,
      quote.percentChange,
      quote.regularMarketChangePercent
    );

    if (
      price &&
      previousClose &&
      stock.quantity > 0
    ) {
      portfolioTotals[stock.market].currentValue +=
        price * stock.quantity;

      portfolioTotals[stock.market].previousValue +=
        previousClose * stock.quantity;

      portfolioTotals[stock.market].dailyChange +=
        (price - previousClose) * stock.quantity;
    }

    const volumeRatio = getVolumeRatio(quote);

    const minimumMove =
      stock.market === 'NASDAQ' ? 3 : 2;

    if (
      volumeRatio &&
      volumeRatio >= 2.5 &&
      changePercent !== null &&
      Math.abs(changePercent) >= minimumMove
    ) {
      const historyId =
        `${dateKey}_${stock.code}_volume_` +
        `${Math.floor(volumeRatio * 10)}`;

      const historyRef = userRef
        .collection('smartAlertHistory')
        .doc(historyId);

      const result = await sendOncePerDay({
        historyRef,
        messaging,
        tokens,
        title: `🚨 ${stock.code} olağan dışı hacim`,
        body:
          `Hacim günlük ortalamanın ` +
          `${volumeRatio.toFixed(1)} katına çıktı. ` +
          `Değişim: ${signedPercent(changePercent)}. ` +
          `Son fiyat: ${formatMoney(
            price,
            stock.market
          )}`,
        baseUrl,
        details: {
          type: 'volume',
          symbol: stock.code,
          market: stock.market,
          volumeRatio,
          changePercent,
          price,
          dateKey,
        },
      });

      totalSent += result.successCount;
    }

    const technicalSignal =
      getTechnicalSignal(quote);

    if (technicalSignal) {
      const historyId =
        `${dateKey}_${stock.code}_` +
        `${technicalSignal.type}`;

      const historyRef = userRef
        .collection('smartAlertHistory')
        .doc(historyId);

      const result = await sendOncePerDay({
        historyRef,
        messaging,
        tokens,
        title:
          `📊 ${stock.code} ` +
          `${technicalSignal.titleSuffix}`,
        body:
          `${technicalSignal.text} ` +
          `Günlük değişim: ` +
          `${signedPercent(changePercent)}.`,
        baseUrl,
        details: {
          type: technicalSignal.type,
          symbol: stock.code,
          market: stock.market,
          price,
          level: technicalSignal.level,
          changePercent,
          dateKey,
        },
      });

      totalSent += result.successCount;
    }
  }

  for (const market of ['BIST', 'NASDAQ']) {
    const totals = portfolioTotals[market];

    if (
      totals.previousValue <= 0 ||
      totals.currentValue <= 0
    ) {
      continue;
    }

    const portfolioPercent =
      (totals.dailyChange /
        totals.previousValue) *
      100;

    if (Math.abs(portfolioPercent) < 2) {
      continue;
    }

    const direction =
      portfolioPercent >= 0
        ? 'yükseldi'
        : 'düştü';

    const historyRef = userRef
      .collection('smartAlertHistory')
      .doc(
        `${dateKey}_${market}_portfolio_` +
          `${portfolioPercent >= 0 ? 'up' : 'down'}`
      );

    const result = await sendOncePerDay({
      historyRef,
      messaging,
      tokens,
      title:
        portfolioPercent >= 0
          ? `💰 ${market} portföyün yükseliyor`
          : `⚠️ ${market} portföyün düşüyor`,
      body:
        `${market} portföyün bugün ` +
        `${signedPercent(portfolioPercent)} ${direction}. ` +
        `Günlük fark: ${formatMoney(
          totals.dailyChange,
          market
        )}`,
      baseUrl,
      details: {
        type: 'portfolio-daily-change',
        market,
        portfolioPercent,
        dailyChange: totals.dailyChange,
        currentValue: totals.currentValue,
        previousValue: totals.previousValue,
        dateKey,
      },
    });

    totalSent += result.successCount;
  }

  return {
    stocks: stocks.length,
    sent: totalSent,
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

    const usersSnapshot =
      await adminDb.collection('users').get();

    const dateKey =
      getIstanbulDateKey();

    let totalStocks = 0;
    let totalSent = 0;

    for (const userDoc of usersSnapshot.docs) {
      const result = await processUser({
        userDoc,
        messaging,
        baseUrl,
        dateKey,
      });

      totalStocks += result.stocks;
      totalSent += result.sent;
    }

    return NextResponse.json({
      ok: true,
      version: 'smart-alerts-v2',
      users: usersSnapshot.size,
      stocks: totalStocks,
      sent: totalSent,
      dateKey,
    });
  } catch (error) {
    console.error(
      'Sky Finans V2 alarm hatası:',
      error
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          error?.message ||
          'Akıllı alarm kontrolü başarısız.',
      },
      {
        status: 500,
      }
    );
  }
}
