import { NextResponse } from 'next/server';
import {
  cert,
  getApps,
  initializeApp,
} from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
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

function normalizeMarket(item) {
  const raw = String(
    item.market ||
      item.exchange ||
      item.region ||
      ''
  ).toUpperCase();

  if (
    raw.includes('NASDAQ') ||
    raw.includes('NYSE') ||
    raw.includes('US') ||
    raw.includes('AMERICA')
  ) {
    return 'NASDAQ';
  }

  return 'BIST';
}

function getThresholds(market) {
  if (market === 'NASDAQ') {
    return {
      up: 5,
      down: -5,
    };
  }

  return {
    up: 3,
    down: -2,
  };
}

function formatPrice(price, market) {
  const value = Number(price);

  if (!Number.isFinite(value)) {
    return '-';
  }

  return market === 'NASDAQ'
    ? `${value.toFixed(2)} USD`
    : `${value.toFixed(2)} TL`;
}

function getAlertRule(changePercent, thresholds) {
  const change = Number(changePercent);

  if (!Number.isFinite(change)) {
    return null;
  }

  if (change >= thresholds.up) {
    return {
      direction: 'up',
      threshold: thresholds.up,
    };
  }

  if (change <= thresholds.down) {
    return {
      direction: 'down',
      threshold: thresholds.down,
    };
  }

  return null;
}

function getIstanbulDateKey() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

async function fetchPrices(baseUrl, market, codes) {
  if (codes.length === 0) {
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
        codes,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(
      `${market} fiyat servisi hatası: ${response.status}`
    );
  }

  const data = await response.json();

  return data?.prices || {};
}

async function processUser({
  adminDb,
  messaging,
  baseUrl,
  userDoc,
  dateKey,
}) {
  const userRef = userDoc.ref;

  const [portfolioSnapshot, deviceSnapshot] =
    await Promise.all([
      userRef.collection('portfolio').get(),
      userRef
        .collection('notificationDevices')
        .where('enabled', '==', true)
        .get(),
    ]);

  const tokens = deviceSnapshot.docs
    .map((doc) => doc.data()?.token)
    .filter(Boolean);

  if (
    portfolioSnapshot.empty ||
    tokens.length === 0
  ) {
    return {
      checked: 0,
      sent: 0,
    };
  }

  const stocks = portfolioSnapshot.docs
    .map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }))
    .map((item) => ({
      ...item,
      code: String(
        item.code ||
          item.symbol ||
          item.ticker ||
          item.id ||
          ''
      )
        .trim()
        .toUpperCase(),
      market: normalizeMarket(item),
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
      fetchPrices(
        baseUrl,
        'NASDAQ',
        nasdaqCodes
      ),
    ]);

  let sent = 0;

  for (const stock of stocks) {
    const prices =
      stock.market === 'NASDAQ'
        ? nasdaqPrices
        : bistPrices;

    const quote = prices?.[stock.code];

    if (!quote) {
      continue;
    }

    const changePercent =
      Number(quote.changePercent);

    const thresholds =
      getThresholds(stock.market);

    const alertRule = getAlertRule(
      changePercent,
      thresholds
    );

    if (!alertRule) {
      continue;
    }

    const alertId = [
      dateKey,
      stock.code,
      alertRule.direction,
      String(alertRule.threshold).replace(
        '.',
        '_'
      ),
    ].join('_');

    const alertRef = userRef
      .collection('alertHistory')
      .doc(alertId);

    const alreadySent = await alertRef.get();

    if (alreadySent.exists) {
      continue;
    }

    const isUp =
      alertRule.direction === 'up';

    const title = isUp
      ? `${stock.code} yükseliş alarmı`
      : `${stock.code} düşüş alarmı`;

    const formattedChange =
      `${changePercent > 0 ? '+' : ''}` +
      `${changePercent.toFixed(2)}%`;

    const body =
      `${stock.code} bugün ${formattedChange}. ` +
      `Son fiyat: ${formatPrice(
        quote.price,
        stock.market
      )}`;

    const result =
      await messaging.sendEachForMulticast({
        tokens,
        notification: {
          title,
          body,
        },
        data: {
          url: '/senkron-panel',
          symbol: stock.code,
          market: stock.market,
          changePercent:
            String(changePercent),
          price: String(quote.price ?? ''),
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

    await alertRef.set({
      symbol: stock.code,
      market: stock.market,
      direction: alertRule.direction,
      threshold: alertRule.threshold,
      changePercent,
      price: Number(quote.price),
      sentAt:
        new Date().toISOString(),
      successCount:
        result.successCount,
      failureCount:
        result.failureCount,
    });

    sent += result.successCount;
  }

  return {
    checked: stocks.length,
    sent,
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

    let totalChecked = 0;
    let totalSent = 0;

    for (const userDoc of usersSnapshot.docs) {
      const result = await processUser({
        adminDb,
        messaging,
        baseUrl,
        userDoc,
        dateKey,
      });

      totalChecked += result.checked;
      totalSent += result.sent;
    }

    return NextResponse.json({
      ok: true,
      dateKey,
      users: usersSnapshot.size,
      checked: totalChecked,
      sent: totalSent,
    });
  } catch (error) {
    console.error(
      'Fiyat alarmı hatası:',
      error
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          error?.message ||
          'Alarm kontrolü başarısız.',
      },
      {
        status: 500,
      }
    );
  }
}
