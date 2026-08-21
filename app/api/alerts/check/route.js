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
    item?.market ||
      item?.exchange ||
      item?.region ||
      ''
  ).toUpperCase();

  if (
    raw.includes('NASDAQ') ||
    raw.includes('NYSE') ||
    raw.includes('AMEX') ||
    raw === 'US' ||
    raw.includes('AMERICA')
  ) {
    return 'NASDAQ';
  }

  return 'BIST';
}

function normalizeStock(item, id = '') {
  const code = String(
    item?.code ||
      item?.symbol ||
      item?.ticker ||
      id ||
      ''
  )
    .trim()
    .toUpperCase()
    .replace(
      /^(BIST|NASDAQ|NYSE|AMEX):/,
      ''
    );

  return {
    ...item,
    code,
    market: normalizeMarket(item),
  };
}

function numberValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? parsed
    : null;
}

function getIstanbulDateKey() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function formatPrice(price, market) {
  const value = Number(price);

  if (!Number.isFinite(value)) return '-';

  return market === 'NASDAQ'
    ? `${value.toFixed(2)} USD`
    : `${value.toFixed(2)} TL`;
}

async function fetchPrices(
  baseUrl,
  market,
  codes
) {
  const unique = [
    ...new Set(codes.filter(Boolean)),
  ];

  if (!unique.length) return {};

  const response = await fetch(
    `${baseUrl}/api/prices`,
    {
      method: 'POST',
      headers: {
        'Content-Type':
          'application/json',
      },
      cache: 'no-store',
      body: JSON.stringify({
        market:
          market === 'BIST'
            ? 'bist'
            : 'us',
        codes: unique,
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

async function sendAlert({
  messaging,
  tokens,
  baseUrl,
  title,
  body,
  stock,
  quote,
  type,
}) {
  return messaging.sendEachForMulticast({
    tokens,
    notification: {
      title,
      body,
    },
    data: {
      url: '/senkron-panel',
      symbol: stock.code,
      market: stock.market,
      type,
      price:
        String(quote?.price ?? ''),
      changePercent:
        String(
          quote?.changePercent ?? ''
        ),
    },
    webpush: {
      fcmOptions: {
        link:
          `${baseUrl}/senkron-panel`,
      },
      notification: {
        icon: '/icon-192.png',
        badge: '/icon-192.png',
      },
    },
  });
}

function customRules(alert, quote) {
  const price = numberValue(quote?.price);
  const change =
    numberValue(quote?.changePercent);

  const rules = [];

  const priceAbove =
    numberValue(alert.priceAbove);
  const priceBelow =
    numberValue(alert.priceBelow);
  const percentUp =
    numberValue(alert.percentUp);
  const percentDown =
    numberValue(alert.percentDown);

  if (
    priceAbove > 0 &&
    price >= priceAbove
  ) {
    rules.push({
      key: 'priceAbove',
      label: 'üst fiyat',
      target: priceAbove,
      message:
        `${alert.code} ${formatPrice(
          priceAbove,
          alert.market
        )} seviyesinin üzerine çıktı.`,
    });
  }

  if (
    priceBelow > 0 &&
    price <= priceBelow
  ) {
    rules.push({
      key: 'priceBelow',
      label: 'alt fiyat',
      target: priceBelow,
      message:
        `${alert.code} ${formatPrice(
          priceBelow,
          alert.market
        )} seviyesinin altına düştü.`,
    });
  }

  if (
    percentUp > 0 &&
    change >= percentUp
  ) {
    rules.push({
      key: 'percentUp',
      label: 'yükseliş',
      target: percentUp,
      message:
        `${alert.code} bugün +${change.toFixed(
          2
        )}% yükseldi.`,
    });
  }

  if (
    percentDown > 0 &&
    change <= -Math.abs(percentDown)
  ) {
    rules.push({
      key: 'percentDown',
      label: 'düşüş',
      target: percentDown,
      message:
        `${alert.code} bugün ${change.toFixed(
          2
        )}% düştü.`,
    });
  }

  return rules;
}

async function processUser({
  messaging,
  baseUrl,
  userDoc,
  dateKey,
}) {
  const userRef = userDoc.ref;

  const [
    portfolioSnapshot,
    watchlistSnapshot,
    customAlertsSnapshot,
    deviceSnapshot,
  ] = await Promise.all([
    userRef.collection('portfolio').get(),
    userRef.collection('watchlist').get(),
    userRef.collection('priceAlerts').get(),
    userRef
      .collection('notificationDevices')
      .where('enabled', '==', true)
      .get(),
  ]);

  const tokens = [
    ...new Set(
      deviceSnapshot.docs
        .map(
          (device) =>
            device.data()?.token
        )
        .filter(Boolean)
    ),
  ];

  if (!tokens.length) {
    return {
      checked: 0,
      customChecked: 0,
      sent: 0,
    };
  }

  const portfolio = portfolioSnapshot.docs
    .map((document) =>
      normalizeStock(
        document.data(),
        document.id
      )
    )
    .filter((stock) => stock.code);

  const watchlist = watchlistSnapshot.docs
    .map((document) =>
      normalizeStock(
        document.data(),
        document.id
      )
    )
    .filter((stock) => stock.code);

  const customAlerts =
    customAlertsSnapshot.docs
      .map((document) => ({
        id: document.id,
        ...normalizeStock(
          document.data(),
          document.id
        ),
      }))
      .filter(
        (alert) =>
          alert.code &&
          alert.enabled !== false
      );

  const stockMap = new Map();

  for (const stock of [
    ...portfolio,
    ...watchlist,
    ...customAlerts,
  ]) {
    stockMap.set(
      `${stock.market}:${stock.code}`,
      stock
    );
  }

  const allStocks = [
    ...stockMap.values(),
  ];

  const bistCodes = allStocks
    .filter(
      (stock) =>
        stock.market === 'BIST'
    )
    .map((stock) => stock.code);

  const nasdaqCodes = allStocks
    .filter(
      (stock) =>
        stock.market === 'NASDAQ'
    )
    .map((stock) => stock.code);

  const [bistPrices, nasdaqPrices] =
    await Promise.all([
      fetchPrices(
        baseUrl,
        'BIST',
        bistCodes
      ),
      fetchPrices(
        baseUrl,
        'NASDAQ',
        nasdaqCodes
      ),
    ]);

  function quoteFor(stock) {
    return stock.market === 'NASDAQ'
      ? nasdaqPrices?.[stock.code]
      : bistPrices?.[stock.code];
  }

  let sent = 0;

  // Mevcut portföy +5 / -7 alarmları
  for (const stock of portfolio) {
    const quote = quoteFor(stock);
    const change =
      numberValue(quote?.changePercent);

    if (change === null) continue;

    const direction =
      change >= 5
        ? 'up'
        : change <= -7
          ? 'down'
          : null;

    if (!direction) continue;

    const alertId =
      `${dateKey}_${stock.code}_${direction}`;

    const historyRef = userRef
      .collection('alertHistory')
      .doc(alertId);

    if ((await historyRef.get()).exists) {
      continue;
    }

    const result = await sendAlert({
      messaging,
      tokens,
      baseUrl,
      stock,
      quote,
      type: 'portfolio-daily-move',
      title:
        direction === 'up'
          ? `${stock.code} yükseliş alarmı`
          : `${stock.code} düşüş alarmı`,
      body:
        `${stock.code} bugün ` +
        `${change > 0 ? '+' : ''}` +
        `${change.toFixed(2)}%. ` +
        `Son fiyat: ${formatPrice(
          quote.price,
          stock.market
        )}`,
    });

    if (result.successCount > 0) {
      await historyRef.set({
        symbol: stock.code,
        market: stock.market,
        direction,
        changePercent: change,
        price:
          numberValue(quote.price),
        sentAt:
          new Date().toISOString(),
        successCount:
          result.successCount,
        failureCount:
          result.failureCount,
      });
    }

    sent += result.successCount;
  }

  // Kullanıcının takip listesinden kurduğu özel alarmlar
  for (const alert of customAlerts) {
    const quote = quoteFor(alert);

    if (!quote) continue;

    const rules =
      customRules(alert, quote);

    for (const rule of rules) {
      const safeTarget =
        String(rule.target)
          .replace('.', '_');

      const historyId = [
        'custom',
        dateKey,
        alert.id,
        rule.key,
        safeTarget,
      ].join('_');

      const historyRef = userRef
        .collection('alertHistory')
        .doc(historyId);

      if ((await historyRef.get()).exists) {
        continue;
      }

      const result = await sendAlert({
        messaging,
        tokens,
        baseUrl,
        stock: alert,
        quote,
        type: `custom-${rule.key}`,
        title:
          `${alert.code} ${rule.label} alarmı`,
        body:
          `${rule.message} Son fiyat: ` +
          `${formatPrice(
            quote.price,
            alert.market
          )}`,
      });

      if (result.successCount > 0) {
        await historyRef.set({
          customAlertId: alert.id,
          symbol: alert.code,
          market: alert.market,
          rule: rule.key,
          target: rule.target,
          price:
            numberValue(quote.price),
          changePercent:
            numberValue(
              quote.changePercent
            ),
          sentAt:
            new Date().toISOString(),
          successCount:
            result.successCount,
          failureCount:
            result.failureCount,
        });
      }

      sent += result.successCount;
    }
  }

  return {
    checked: allStocks.length,
    customChecked:
      customAlerts.length,
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
        { status: 401 }
      );
    }

    const baseUrl =
      process.env.APP_URL ||
      'https://finans-paneli-amber.vercel.app';

    getAdminApp();

    const adminDb = getFirestore();
    const messaging = getMessaging();

    const usersSnapshot =
      await adminDb
        .collection('users')
        .get();

    const dateKey =
      getIstanbulDateKey();

    let totalChecked = 0;
    let totalCustomChecked = 0;
    let totalSent = 0;

    for (
      const userDoc of usersSnapshot.docs
    ) {
      const result =
        await processUser({
          messaging,
          baseUrl,
          userDoc,
          dateKey,
        });

      totalChecked += result.checked;
      totalCustomChecked +=
        result.customChecked;
      totalSent += result.sent;
    }

    return NextResponse.json({
      ok: true,
      version: 'price-alerts-custom-v1',
      dateKey,
      users: usersSnapshot.size,
      checked: totalChecked,
      customChecked:
        totalCustomChecked,
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
          'Fiyat alarmları kontrol edilemedi.',
      },
      { status: 500 }
    );
  }
}
