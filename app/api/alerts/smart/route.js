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

function getMarketClock(market) {
  const timeZone =
    market === 'NASDAQ'
      ? 'America/New_York'
      : 'Europe/Istanbul';

  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date())
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value])
  );

  const minutes =
    Number(parts.hour) * 60 +
    Number(parts.minute);

  const closeMinutes =
    market === 'NASDAQ'
      ? 16 * 60
      : 18 * 60 + 10;

  return {
    dateKey:
      `${parts.year}-${parts.month}-${parts.day}`,
    isWeekday: !['Sat', 'Sun'].includes(parts.weekday),
    isClosed: minutes >= closeMinutes,
  };
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

async function fetchFuturesEmaSignal() {
  const response = await fetch(
    'https://scanner.tradingview.com/global/scan',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0',
      },
      cache: 'no-store',
      body: JSON.stringify({
        symbols: {
          tickers: ['BIST:XU030D1!'],
          query: { types: [] },
        },
        columns: [
          'close',
          'EMA5',
          'EMA20',
          'EMA100',
          'EMA200',
        ],
      }),
    }
  );

  if (!response.ok) {
    throw new Error(
      `FXU030N1 veri servisi hatasi: ${response.status}`
    );
  }

  const data = await response.json();
  const values = data?.data?.[0]?.d || [];

  const [price, ema5, ema20, ema100, ema200] =
    values.map((value) => numberValue(value));

  if (
    ![price, ema5, ema20, ema100, ema200].every(
      Number.isFinite
    )
  ) {
    return null;
  }

  return {
    symbol: 'FXU030N1',
    tradingViewSymbol: 'BIST:XU030D1!',
    price,
    ema5,
    ema20,
    ema100,
    ema200,
    ema100Distance:
      Math.abs((price - ema100) / ema100) * 100,
    ema200Distance:
      Math.abs((price - ema200) / ema200) * 100,
  };
}

async function processFuturesAlerts({
  userRef,
  messaging,
  tokens,
  baseUrl,
  dateKey,
  signal,
}) {
  if (!signal || tokens.length === 0) {
    return 0;
  }

  const alerts = [];
  const stateRef = userRef
    .collection('smartAlertState')
    .doc('FXU030N1');

  const previousState = await stateRef.get();
  const previousRelation =
    previousState.data()?.ema5Ema20Relation || null;
  const currentRelation =
    signal.ema5 >= signal.ema20 ? 'above' : 'below';

  if (
    previousRelation === 'below' &&
    currentRelation === 'above'
  ) {
    alerts.push({
      id: 'ema5_20_up',
      title: '🟢 FXU030N1 yukari kesisti',
      body:
        `EMA 5, EMA 20 seviyesini yukari kesti. ` +
        `Son fiyat: ${signal.price.toFixed(2)}.`,
      type: 'futures-ema-cross-up',
    });
  }

  if (
    previousRelation === 'above' &&
    currentRelation === 'below'
  ) {
    alerts.push({
      id: 'ema5_20_down',
      title: '🔴 FXU030N1 asagi kesisti',
      body:
        `EMA 5, EMA 20 seviyesini asagi kesti. ` +
        `Son fiyat: ${signal.price.toFixed(2)}.`,
      type: 'futures-ema-cross-down',
    });
  }

  if (signal.ema100Distance <= 2) {
    alerts.push({
      id: 'ema100_near',
      title: '🟡 FXU030N1 EMA 100 seviyesine yakin',
      body:
        `Fiyat EMA 100 seviyesine %${signal.ema100Distance.toFixed(2)} ` +
        `uzaklikta. Son fiyat: ${signal.price.toFixed(2)}.`,
      type: 'futures-ema100-near',
    });
  }

  if (signal.ema200Distance <= 2) {
    alerts.push({
      id: 'ema200_near',
      title: '🟠 FXU030N1 EMA 200 seviyesine yakin',
      body:
        `Fiyat EMA 200 seviyesine %${signal.ema200Distance.toFixed(2)} ` +
        `uzaklikta. Son fiyat: ${signal.price.toFixed(2)}.`,
      type: 'futures-ema200-near',
    });
  }

  let sent = 0;

  for (const alert of alerts) {
    const result = await sendOncePerDay({
      historyRef: userRef
        .collection('smartAlertHistory')
        .doc(`${dateKey}_FXU030N1_${alert.id}`),
      messaging,
      tokens,
      title: alert.title,
      body: alert.body,
      baseUrl,
      details: {
        type: alert.type,
        symbol: signal.symbol,
        price: signal.price,
        ema5: signal.ema5,
        ema20: signal.ema20,
        ema100: signal.ema100,
        ema200: signal.ema200,
        ema100Distance: signal.ema100Distance,
        ema200Distance: signal.ema200Distance,
        dateKey,
      },
    });

    sent += result.successCount;
  }

  await stateRef.set(
    {
      symbol: signal.symbol,
      ema5Ema20Relation: currentRelation,
      price: signal.price,
      ema5: signal.ema5,
      ema20: signal.ema20,
      ema100: signal.ema100,
      ema200: signal.ema200,
      checkedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return sent;
}

async function processUser({
  userDoc,
  messaging,
  baseUrl,
  dateKey,
  futuresSignal,
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

  const futuresSent = await processFuturesAlerts({
    userRef,
    messaging,
    tokens,
    baseUrl,
    dateKey,
    signal: futuresSignal,
  });

  if (
    portfolioSnapshot.empty ||
    tokens.length === 0
  ) {
    return {
      stocks: 0,
      sent: futuresSent,
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

  let totalSent = futuresSent;

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
    const marketClock = getMarketClock(market);

    if (
      !marketClock.isWeekday ||
      !marketClock.isClosed ||
      totals.previousValue <= 0 ||
      totals.currentValue <= 0
    ) {
      continue;
    }

    const portfolioPercent =
      (totals.dailyChange /
        totals.previousValue) *
      100;

    const direction =
      portfolioPercent >= 0
        ? 'yükseldi'
        : 'düştü';

    const historyRef = userRef
      .collection('smartAlertHistory')
      .doc(
        `${marketClock.dateKey}_${market}_close_summary`
      );

    const result = await sendOncePerDay({
      historyRef,
      messaging,
      tokens,
      title: `📊 ${market} gün sonu özeti`,
      body:
        `Portföy bugün ${signedPercent(portfolioPercent)} ` +
        `${direction}. Günlük kâr/zarar: ${formatMoney(
          totals.dailyChange,
          market
        )}. Gün sonu değeri: ${formatMoney(
          totals.currentValue,
          market
        )}.`,
      baseUrl,
      details: {
        type: 'portfolio-close-summary',
        market,
        portfolioPercent,
        dailyChange: totals.dailyChange,
        currentValue: totals.currentValue,
        previousValue: totals.previousValue,
        dateKey: marketClock.dateKey,
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

    const futuresSignal =
      await fetchFuturesEmaSignal();

    let totalStocks = 0;
    let totalSent = 0;

    for (const userDoc of usersSnapshot.docs) {
      const result = await processUser({
        userDoc,
        messaging,
        baseUrl,
        dateKey,
        futuresSignal,
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
