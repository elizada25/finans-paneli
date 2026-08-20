import { NextResponse } from 'next/server';
import {
  cert,
  getApps,
  initializeApp,
} from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_OPEN_POSITIONS = 3;
const MAX_DAILY_ENTRIES = 3;
const RISK_PER_TRADE = 1000;
const MAX_POSITION_RATE = 0.30;
const CASH_RESERVE_RATE = 0.10;
const COMMISSION_RATE = 0.0015;
const SLIPPAGE_RATE = 0.0005;

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

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(number(value) * factor) / factor;
}

function marketClock() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Europe/Istanbul',
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

  return {
    dateKey:
      `${parts.year}-${parts.month}-${parts.day}`,
    weekday: parts.weekday,
    minutes,
    isWeekday:
      !['Sat', 'Sun'].includes(parts.weekday),
    inRobotWindow:
      minutes >= 10 * 60 + 30 &&
      minutes <= 18 * 60 + 10,
  };
}

function dateKey(value) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value));
}

function totalEquity(robot) {
  return (
    number(robot.cash) +
    (robot.positions || []).reduce(
      (total, position) =>
        total +
        number(position.quantity) *
          number(
            position.lastPrice ||
              position.entryPrice
          ),
      0
    )
  );
}

function closePosition(
  robot,
  position,
  price,
  reason,
  timestamp
) {
  const grossSale =
    number(position.quantity) *
    number(price) *
    (1 - SLIPPAGE_RATE);

  const saleCommission =
    grossSale * COMMISSION_RATE;

  const netSale =
    grossSale - saleCommission;

  const totalCost =
    number(position.cost) +
    number(position.buyCommission);

  const profitLoss =
    netSale - totalCost;

  robot.cash = round(
    number(robot.cash) + netSale
  );

  robot.trades.unshift({
    id: `${position.symbol}-${timestamp}`,
    symbol: position.symbol,
    quantity: position.quantity,
    entryPrice: position.entryPrice,
    exitPrice: round(price),
    openedAt: position.openedAt,
    closedAt: timestamp,
    reason,
    profitLoss: round(profitLoss),
    returnPercent:
      totalCost > 0
        ? round(
            (profitLoss / totalCost) * 100
          )
        : 0,
  });
}

function processRobot(current, scan, clock) {
  if (
    !current.active ||
    !scan?.generatedAt ||
    current.lastProcessed === scan.generatedAt
  ) {
    return current;
  }

  const next = {
    ...current,
    positions: Array.isArray(current.positions)
      ? current.positions.map((item) => ({
          ...item,
        }))
      : [],
    trades: Array.isArray(current.trades)
      ? [...current.trades]
      : [],
    dailyEntries: {
      ...(current.dailyEntries || {}),
    },
    lastProcessed: scan.generatedAt,
    lastRunAt: new Date().toISOString(),
    lastSessionDate: clock.dateKey,
    updatedAt: new Date().toISOString(),
    storageMode: 'firestore',
  };

  const checks = new Map(
    (scan.positionChecks || []).map((item) => [
      item.symbol,
      item,
    ])
  );

  const expired =
    next.endsAt &&
    Date.now() >=
      new Date(next.endsAt).getTime();

  const remainingPositions = [];

  for (const position of next.positions) {
    const check = checks.get(position.symbol);

    if (
      !check ||
      check.sessionDate !== clock.dateKey ||
      !number(check.price)
    ) {
      remainingPositions.push(position);
      continue;
    }

    const currentPrice = number(check.price);

    const updated = {
      ...position,
      lastPrice: currentPrice,
      lastCheckedAt: scan.generatedAt,
    };

    if (
      currentPrice >= number(position.target1) &&
      number(updated.stop) <
        number(position.entryPrice)
    ) {
      updated.stop = position.entryPrice;
      updated.stopMovedToEntry = true;
    }

    let exitReason = '';

    if (expired) {
      exitReason =
        '30 günlük test süresi tamamlandı';
    } else if (
      currentPrice <= number(updated.stop)
    ) {
      exitReason = updated.stopMovedToEntry
        ? 'Maliyet stopu çalıştı'
        : 'Koruyucu stop çalıştı';
    } else if (
      currentPrice >= number(position.target2)
    ) {
      exitReason = 'İkinci hedefe ulaştı';
    } else if (check.exitSignal) {
      exitReason =
        check.exitReason ||
        'Teknik çıkış sinyali oluştu';
    }

    if (exitReason) {
      closePosition(
        next,
        updated,
        currentPrice,
        exitReason,
        scan.generatedAt
      );
    } else {
      remainingPositions.push(updated);
    }
  }

  next.positions = remainingPositions;

  if (expired) {
    if (next.positions.length === 0) {
      next.active = false;
      next.completedAt =
        new Date().toISOString();
    }

    return next;
  }

  let todayCount = number(
    next.dailyEntries[clock.dateKey]
  );

  const candidates = (
    scan.items || []
  ).filter(
    (item) =>
      item.setup === 'İŞLEM SİNYALİ' &&
      item.sessionDate === clock.dateKey
  );

  for (const item of candidates) {
    if (
      next.positions.length >=
        MAX_OPEN_POSITIONS ||
      todayCount >= MAX_DAILY_ENTRIES
    ) {
      break;
    }

    if (
      next.positions.some(
        (position) =>
          position.symbol === item.symbol
      )
    ) {
      continue;
    }

    const tradedToday = next.trades.some(
      (trade) =>
        trade.symbol === item.symbol &&
        trade.closedAt &&
        dateKey(trade.closedAt) ===
          clock.dateKey
    );

    if (tradedToday) continue;

    const entry = number(item.entry);
    const riskPerShare =
      number(item.riskPerShare);

    if (
      entry <= 0 ||
      riskPerShare <= 0
    ) {
      continue;
    }

    const equity = totalEquity(next);
    const reserve =
      equity * CASH_RESERVE_RATE;

    const usableCash = Math.max(
      0,
      number(next.cash) - reserve
    );

    const maximumPosition =
      equity * MAX_POSITION_RATE;

    const riskLot = Math.floor(
      RISK_PER_TRADE / riskPerShare
    );

    const allocationLot = Math.floor(
      maximumPosition / entry
    );

    const cashLot = Math.floor(
      usableCash /
        (
          entry *
          (1 + SLIPPAGE_RATE) *
          (1 + COMMISSION_RATE)
        )
    );

    const quantity = Math.max(
      0,
      Math.min(
        riskLot,
        allocationLot,
        cashLot
      )
    );

    if (quantity < 1) continue;

    const executionPrice =
      entry * (1 + SLIPPAGE_RATE);

    const cost =
      quantity * executionPrice;

    const buyCommission =
      cost * COMMISSION_RATE;

    const totalDebit =
      cost + buyCommission;

    if (totalDebit > next.cash) continue;

    next.cash = round(
      next.cash - totalDebit
    );

    next.positions.push({
      symbol: item.symbol,
      quantity,
      entryPrice: round(executionPrice),
      signalPrice: round(entry),
      stop: round(item.stop),
      target1: round(item.target1),
      target2: round(item.target2),
      cost: round(cost),
      buyCommission: round(buyCommission),
      openedAt: scan.generatedAt,
      lastCheckedAt: scan.generatedAt,
      lastPrice: round(entry),
      score: item.score,
      stopMovedToEntry: false,
    });

    todayCount += 1;
  }

  next.dailyEntries[clock.dateKey] =
    todayCount;

  return next;
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
        { error: 'Yetkisiz erişim.' },
        { status: 401 }
      );
    }

    const clock = marketClock();

    if (
      !clock.isWeekday ||
      !clock.inRobotWindow
    ) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason:
          'BIST robot çalışma saatleri dışında.',
        clock,
      });
    }

    getAdminApp();

    const db = getFirestore();
    const usersSnapshot =
      await db.collection('users').get();

    const robots = [];

    await Promise.all(
      usersSnapshot.docs.map(async (userDoc) => {
        const ref = userDoc.ref
          .collection('paperTrading')
          .doc('bist30Day');

        const snapshot = await ref.get();

        if (
          snapshot.exists &&
          snapshot.data()?.active
        ) {
          robots.push({
            ref,
            data: snapshot.data(),
          });
        }
      })
    );

    if (!robots.length) {
      return NextResponse.json({
        ok: true,
        activeRobots: 0,
        updatedRobots: 0,
        message: 'Aktif sanal robot yok.',
      });
    }

    const symbols = [
      ...new Set(
        robots.flatMap((robot) =>
          (robot.data.positions || [])
            .map((position) => position.symbol)
            .filter(Boolean)
        )
      ),
    ].slice(0, 20);

    const baseUrl =
      process.env.APP_URL ||
      'https://finans-paneli-amber.vercel.app';

    const query = symbols.length
      ? `?positions=${encodeURIComponent(
          symbols.join(',')
        )}`
      : '';

    const response = await fetch(
      `${baseUrl}/api/bist-daytrade${query}`,
      {
        cache: 'no-store',
        signal: AbortSignal.timeout(55000),
      }
    );

    const scan = await response.json();

    if (!response.ok || !scan?.ok) {
      throw new Error(
        scan?.error ||
        'BIST tarama servisi cevap vermedi.'
      );
    }

    const batch = db.batch();

    for (const robot of robots) {
      const next = processRobot(
        robot.data,
        scan,
        clock
      );

      batch.set(robot.ref, next, {
        merge: true,
      });
    }

    await batch.commit();

    return NextResponse.json({
      ok: true,
      activeRobots: robots.length,
      updatedRobots: robots.length,
      generatedAt: scan.generatedAt,
      candidates:
        Array.isArray(scan.items)
          ? scan.items.length
          : 0,
      positionChecks:
        Array.isArray(scan.positionChecks)
          ? scan.positionChecks.length
          : 0,
      clock,
    });
  } catch (error) {
    console.error(
      'BIST sanal robot hatası:',
      error
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          error?.message ||
          'BIST sanal robot çalıştırılamadı.',
      },
      { status: 500 }
    );
  }
}
