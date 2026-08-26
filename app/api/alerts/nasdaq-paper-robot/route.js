import { NextResponse } from 'next/server';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ROBOT_ID = 'nasdaq4h30Day';
const VERSION = 'nasdaq-4h-strict-v1';
const MAX_OPEN = 3;
const MAX_DAILY_ENTRIES = 2;
const RISK_RATE = 0.0075;
const MAX_POSITION_RATE = 0.25;
const CASH_RESERVE_RATE = 0.20;
const COMMISSION_RATE = 0.001;
const SLIPPAGE_RATE = 0.0005;

function getAdminApp() {
  if (getApps().length) return getApps()[0];
  const encoded = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (!encoded) throw new Error('FIREBASE_SERVICE_ACCOUNT_BASE64 eksik.');
  return initializeApp({
    credential: cert(JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'))),
  });
}

function n(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(n(value) * factor) / factor;
}

function newYorkClock() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York', weekday: 'short', year: 'numeric',
      month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date()).filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value])
  );
  const minutes = n(parts.hour) * 60 + n(parts.minute);
  return {
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: parts.weekday,
    minutes,
    isWeekday: !['Sat', 'Sun'].includes(parts.weekday),
    inRobotWindow: minutes >= 13 * 60 + 35 && minutes <= 16 * 60 + 30,
  };
}

function totalEquity(robot) {
  return n(robot.cash) + (robot.positions || []).reduce(
    (total, position) => total + n(position.quantity) * n(position.lastPrice || position.entryPrice),
    0
  );
}

function strictCandidate(item, latestDataTime) {
  return Boolean(
    item && item.dataTime === latestDataTime && item.setup === 'İŞLEM SİNYALİ' &&
    n(item.score) >= 85 && n(item.price) >= 3 && item.marketPositive === true &&
    item.dailyTrend === true && item.fourHourTrend === true &&
    item.aboveEma20 === true && item.breakout === true &&
    item.macdPositive === true && item.macdRising === true &&
    n(item.volumeRatio) >= 1.2 && item.resistanceRoom === true &&
    n(item.rsi) >= 48 && n(item.rsi) <= 68 &&
    n(item.riskPercent) >= 0.5 && n(item.riskPercent) <= 4
  );
}

function closePosition(robot, position, price, reason, timestamp, events) {
  const executionPrice = n(price) * (1 - SLIPPAGE_RATE);
  const gross = n(position.quantity) * executionPrice;
  const sellCommission = gross * COMMISSION_RATE;
  const net = gross - sellCommission;
  const totalCost = n(position.cost) + n(position.buyCommission);
  const pnl = net - totalCost;
  robot.cash = round(n(robot.cash) + net);
  robot.trades.unshift({
    id: `${position.symbol}-${timestamp}`, symbol: position.symbol,
    quantity: position.quantity, entryPrice: position.entryPrice,
    exitPrice: round(executionPrice), openedAt: position.openedAt,
    closedAt: timestamp, reason, pnl: round(pnl),
    returnPercent: totalCost > 0 ? round((pnl / totalCost) * 100) : 0,
  });
  events.push({ type: 'closed', symbol: position.symbol, pnl: round(pnl), reason });
}

function processRobot(current, scan, clock) {
  const items = Array.isArray(scan.items) ? scan.items : [];
  const latestDataTime = items.map((item) => item.dataTime).filter(Boolean).sort().at(-1);
  if (!current.active || !latestDataTime || current.lastProcessedDataTime === latestDataTime) {
    return { next: current, events: [], changed: false };
  }

  const latestAge = Date.now() - new Date(latestDataTime).getTime();
  if (!Number.isFinite(latestAge) || latestAge < 0 || latestAge > 18 * 60 * 60 * 1000) {
    return { next: current, events: [], changed: false };
  }

  const timestamp = new Date().toISOString();
  const events = [];
  const next = {
    ...current, version: VERSION,
    positions: (current.positions || []).map((item) => ({ ...item })),
    trades: [...(current.trades || [])],
    dailyEntries: { ...(current.dailyEntries || {}) },
    lastProcessedDataTime: latestDataTime, lastRunAt: timestamp,
    lastSessionDate: clock.dateKey, updatedAt: timestamp,
  };
  const checks = new Map(items.map((item) => [item.symbol, item]));
  const expired = Boolean(next.endsAt && Date.now() >= new Date(next.endsAt).getTime());
  const remaining = [];

  for (const position of next.positions) {
    const check = checks.get(position.symbol);
    if (!check || check.dataTime !== latestDataTime || n(check.price) < 3) {
      remaining.push(position);
      continue;
    }
    const price = n(check.price);
    const updated = { ...position, lastPrice: round(price), lastCheckedAt: timestamp };
    if (price >= n(position.target1) && n(updated.stop) < n(position.entryPrice)) {
      updated.stop = position.entryPrice;
      updated.stopMovedToEntry = true;
    }
    let reason = '';
    if (expired) reason = '30 günlük deneme tamamlandı';
    else if (price <= n(updated.stop)) reason = updated.stopMovedToEntry ? 'Maliyet stopu' : 'Koruyucu stop';
    else if (price >= n(position.target2)) reason = 'İkinci hedef';
    else if (n(check.score) < 45 && !check.aboveEma20 && !check.fourHourTrend) reason = '4 saatlik teknik çıkış';
    if (reason) closePosition(next, updated, price, reason, timestamp, events);
    else remaining.push(updated);
  }
  next.positions = remaining;

  if (expired) {
    if (!next.positions.length) {
      next.active = false;
      next.completedAt = timestamp;
    }
    return { next, events, changed: true };
  }

  let dailyCount = n(next.dailyEntries[clock.dateKey]);
  const candidates = items.filter((item) => strictCandidate(item, latestDataTime));
  for (const item of candidates) {
    if (next.positions.length >= MAX_OPEN || dailyCount >= MAX_DAILY_ENTRIES) break;
    if (next.positions.some((position) => position.symbol === item.symbol)) continue;
    const recentTrade = next.trades.find((trade) => trade.symbol === item.symbol && trade.closedAt);
    if (recentTrade && Date.now() - new Date(recentTrade.closedAt).getTime() < 5 * 86400000) continue;

    const entry = n(item.entry);
    const stop = n(item.stop);
    const riskPerShare = entry - stop;
    if (entry <= 0 || stop <= 0 || riskPerShare <= 0) continue;
    const equity = totalEquity(next);
    const usableCash = Math.max(0, n(next.cash) - equity * CASH_RESERVE_RATE);
    const riskLot = Math.floor((equity * RISK_RATE) / riskPerShare);
    const allocationLot = Math.floor((equity * MAX_POSITION_RATE) / entry);
    const cashLot = Math.floor(usableCash / (entry * (1 + SLIPPAGE_RATE) * (1 + COMMISSION_RATE)));
    const quantity = Math.max(0, Math.min(riskLot, allocationLot, cashLot));
    if (quantity < 1) continue;
    const executionPrice = entry * (1 + SLIPPAGE_RATE);
    const cost = quantity * executionPrice;
    const buyCommission = cost * COMMISSION_RATE;
    if (cost + buyCommission > n(next.cash)) continue;
    next.cash = round(n(next.cash) - cost - buyCommission);
    next.positions.push({
      symbol: item.symbol, quantity, entryPrice: round(executionPrice),
      signalPrice: round(entry), stop: round(stop), target1: round(item.target1),
      target2: round(item.target2), cost: round(cost),
      buyCommission: round(buyCommission), openedAt: timestamp,
      signalDataTime: latestDataTime, lastCheckedAt: timestamp,
      lastPrice: round(entry), score: item.score, stopMovedToEntry: false,
    });
    events.push({ type: 'opened', symbol: item.symbol, price: round(executionPrice), score: item.score });
    dailyCount += 1;
  }
  next.dailyEntries[clock.dateKey] = dailyCount;
  return { next, events, changed: true };
}

async function notify(userRef, events, baseUrl) {
  if (!events.length) return;
  const devices = await userRef.collection('notificationDevices').where('enabled', '==', true).get();
  const tokens = devices.docs.map((item) => item.data()?.token).filter(Boolean);
  if (!tokens.length) return;
  for (const event of events) {
    const opened = event.type === 'opened';
    const title = opened ? `📈 ${event.symbol} sanal işlem açıldı` : `📊 ${event.symbol} sanal işlem kapandı`;
    const body = opened
      ? `Katı 4H teyitleri geçti. Sanal giriş: $${event.price} • Puan: ${event.score}`
      : `${event.reason} • Sanal sonuç: ${event.pnl >= 0 ? '+' : ''}$${event.pnl}`;
    await getMessaging().sendEachForMulticast({
      tokens, notification: { title, body },
      data: { type: 'nasdaq-paper', symbol: event.symbol, url: '/senkron-panel#nasdaq-4h' },
      webpush: {
        fcmOptions: { link: `${baseUrl}/senkron-panel#nasdaq-4h` },
        notification: { icon: '/icon-192.png', badge: '/icon-192.png', tag: `nasdaq-paper-${event.symbol}-${event.type}` },
      },
    });
  }
}

export async function GET(request) {
  try {
    if (request.headers.get('authorization') !== `Bearer ${process.env.ALERT_CRON_SECRET}`) {
      return NextResponse.json({ error: 'Yetkisiz erişim.' }, { status: 401 });
    }
    const clock = newYorkClock();
    if (!clock.isWeekday || !clock.inRobotWindow) {
      return NextResponse.json({ ok: true, skipped: true, reason: 'NASDAQ 4H robot çalışma saati dışında.', clock });
    }
    getAdminApp();
    const db = getFirestore();
    const users = await db.collection('users').get();
    const baseUrl = process.env.APP_URL || 'https://finans-paneli-amber.vercel.app';
    const active = [];
    await Promise.all(users.docs.map(async (userDoc) => {
      const ref = userDoc.ref.collection('paperTrading').doc(ROBOT_ID);
      const snapshot = await ref.get();
      if (snapshot.exists && snapshot.data()?.active) active.push({ userRef: userDoc.ref, ref });
    }));
    if (!active.length) return NextResponse.json({ ok: true, activeRobots: 0, updatedRobots: 0 });

    const response = await fetch(`${baseUrl}/api/nasdaq-4h?refresh=1`, {
      cache: 'no-store', signal: AbortSignal.timeout(55000),
    });
    const scan = await response.json();
    if (!response.ok || !scan?.ok) throw new Error(scan?.error || 'NASDAQ 4H taraması alınamadı.');

    let updated = 0;
    for (const robot of active) {
      let events = [];
      await db.runTransaction(async (transaction) => {
        const fresh = await transaction.get(robot.ref);
        if (!fresh.exists || !fresh.data()?.active) return;
        const result = processRobot(fresh.data(), scan, clock);
        events = result.events;
        if (result.changed) {
          transaction.set(robot.ref, result.next, { merge: true });
          updated += 1;
        }
      });
      await notify(robot.userRef, events, baseUrl).catch((error) =>
        console.error('NASDAQ robot bildirimi gönderilemedi:', error)
      );
    }
    return NextResponse.json({ ok: true, activeRobots: active.length, updatedRobots: updated, generatedAt: scan.generatedAt, clock });
  } catch (error) {
    console.error('NASDAQ 4H sanal robot hatası:', error);
    return NextResponse.json({ ok: false, error: error?.message || 'NASDAQ robot çalıştırılamadı.' }, { status: 500 });
  }
}
