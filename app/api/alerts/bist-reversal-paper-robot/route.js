import { NextResponse } from 'next/server';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ROBOT_ID = 'bistReversal30Day';
const VERSION = 'bist-reversal-strict-v1';
const MAX_OPEN = 3;
const MAX_DAILY = 2;
const RISK_RATE = 0.0075;
const MAX_POSITION_RATE = 0.25;
const CASH_RESERVE_RATE = 0.20;
const COMMISSION_RATE = 0.0015;
const SLIPPAGE_RATE = 0.0005;

function adminApp() {
  if (getApps().length) return getApps()[0];
  const encoded = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (!encoded) throw new Error('FIREBASE_SERVICE_ACCOUNT_BASE64 eksik.');
  return initializeApp({ credential: cert(JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'))) });
}

function n(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function round(value, digits = 2) { const factor = 10 ** digits; return Math.round(n(value) * factor) / factor; }

function istanbulClock() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Istanbul', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date()).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  const minutes = n(parts.hour) * 60 + n(parts.minute);
  return {
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: parts.weekday,
    isWeekday: !['Sat', 'Sun'].includes(parts.weekday),
    minutes,
    inWindow: minutes >= 18 * 60 + 20 && minutes <= 21 * 60,
  };
}

function equity(robot) {
  return n(robot.cash) + (robot.positions || []).reduce(
    (sum, position) => sum + n(position.quantity) * n(position.lastPrice || position.entryPrice), 0
  );
}

function strictCandidate(item, latestDataTime) {
  return Boolean(
    item && item.dataTime === latestDataTime && item.status === 'DÖNÜŞ TEYİT EDİLDİ' &&
    n(item.score) >= 85 && n(item.price) > 0 && item.priceConfirmation === true &&
    item.shortTrend === true && item.macdRecovering === true && item.strongVolume === true &&
    n(item.volumeRatio) >= 1.2 && n(item.supportDistance) >= 0 && n(item.supportDistance) <= 5 &&
    (item.bullishDivergence === true || n(item.rsi) <= 35)
  );
}

function close(robot, position, price, reason, now, events) {
  const execution = n(price) * (1 - SLIPPAGE_RATE);
  const gross = n(position.quantity) * execution;
  const commission = gross * COMMISSION_RATE;
  const net = gross - commission;
  const pnl = net - n(position.cost) - n(position.buyCommission);
  robot.cash = round(n(robot.cash) + net);
  robot.trades.unshift({
    id: `${position.symbol}-${now}`, symbol: position.symbol, quantity: position.quantity,
    entryPrice: position.entryPrice, exitPrice: round(execution), openedAt: position.openedAt,
    closedAt: now, reason, pnl: round(pnl),
    returnPercent: n(position.cost) > 0 ? round((pnl / n(position.cost)) * 100) : 0,
  });
  events.push({ type: 'closed', symbol: position.symbol, pnl: round(pnl), reason });
}

function processRobot(current, scan, clock) {
  const items = Array.isArray(scan.items) ? scan.items : [];
  const latestDataTime = items.map((item) => item.dataTime).filter(Boolean).sort().at(-1);
  if (!current.active || !latestDataTime || current.lastProcessedDataTime === latestDataTime) {
    return { next: current, events: [], changed: false };
  }

  const age = Date.now() - new Date(latestDataTime).getTime();
  if (!Number.isFinite(age) || age < 0 || age > 5 * 86400000) {
    return { next: current, events: [], changed: false };
  }

  const now = new Date().toISOString();
  const events = [];
  const next = {
    ...current, version: VERSION,
    positions: (current.positions || []).map((item) => ({ ...item })),
    trades: [...(current.trades || [])], dailyEntries: { ...(current.dailyEntries || {}) },
    lastProcessedDataTime: latestDataTime, lastRunAt: now, lastSessionDate: clock.dateKey, updatedAt: now,
  };
  const checks = new Map(items.map((item) => [item.symbol, item]));
  const expired = Boolean(next.endsAt && Date.now() >= new Date(next.endsAt).getTime());
  const remaining = [];

  for (const position of next.positions) {
    const item = checks.get(position.symbol);
    if (!item || item.dataTime !== latestDataTime || n(item.price) <= 0) { remaining.push(position); continue; }
    const price = n(item.price);
    const updated = { ...position, lastPrice: round(price), lastCheckedAt: now };
    if (price >= n(position.target1) && n(updated.stop) < n(position.entryPrice)) {
      updated.stop = position.entryPrice;
      updated.stopMovedToEntry = true;
    }
    let reason = '';
    if (expired) reason = '30 günlük test tamamlandı';
    else if (price <= n(updated.stop)) reason = updated.stopMovedToEntry ? 'Maliyet stopu' : 'Koruyucu stop';
    else if (price >= n(position.target2)) reason = 'İkinci hedef';
    else if (n(item.score) < 45 && !item.shortTrend && !item.macdRecovering) reason = 'Dönüş yapısı bozuldu';
    if (reason) close(next, updated, price, reason, now, events); else remaining.push(updated);
  }
  next.positions = remaining;

  if (expired) {
    if (!next.positions.length) { next.active = false; next.completedAt = now; }
    return { next, events, changed: true };
  }

  let daily = n(next.dailyEntries[clock.dateKey]);
  for (const item of items.filter((candidate) => strictCandidate(candidate, latestDataTime))) {
    if (next.positions.length >= MAX_OPEN || daily >= MAX_DAILY) break;
    if (next.positions.some((position) => position.symbol === item.symbol)) continue;
    const recent = next.trades.find((trade) => trade.symbol === item.symbol && trade.closedAt);
    if (recent && Date.now() - new Date(recent.closedAt).getTime() < 5 * 86400000) continue;
    const entry = n(item.price), stop = n(item.stop), riskPerShare = entry - stop;
    const riskPercent = entry > 0 ? (riskPerShare / entry) * 100 : 0;
    if (entry <= 0 || stop <= 0 || riskPerShare <= 0 || riskPercent < 1 || riskPercent > 7) continue;
    const total = equity(next);
    const usableCash = Math.max(0, n(next.cash) - total * CASH_RESERVE_RATE);
    const quantity = Math.max(0, Math.min(
      Math.floor((total * RISK_RATE) / riskPerShare),
      Math.floor((total * MAX_POSITION_RATE) / entry),
      Math.floor(usableCash / (entry * (1 + SLIPPAGE_RATE) * (1 + COMMISSION_RATE)))
    ));
    if (quantity < 1) continue;
    const execution = entry * (1 + SLIPPAGE_RATE);
    const cost = quantity * execution;
    const commission = cost * COMMISSION_RATE;
    if (cost + commission > n(next.cash)) continue;
    next.cash = round(n(next.cash) - cost - commission);
    next.positions.push({
      symbol: item.symbol, quantity, entryPrice: round(execution), signalPrice: round(entry),
      stop: round(stop), target1: round(item.target1), target2: round(item.target2),
      cost: round(cost), buyCommission: round(commission), openedAt: now,
      signalDataTime: latestDataTime, lastCheckedAt: now, lastPrice: round(entry),
      score: item.score, stopMovedToEntry: false,
    });
    events.push({ type: 'opened', symbol: item.symbol, price: round(execution), score: item.score });
    daily += 1;
  }
  next.dailyEntries[clock.dateKey] = daily;
  return { next, events, changed: true };
}

async function notify(userRef, events, baseUrl) {
  if (!events.length) return;
  const snapshot = await userRef.collection('notificationDevices').where('enabled', '==', true).get();
  const tokens = snapshot.docs.map((item) => item.data()?.token).filter(Boolean);
  if (!tokens.length) return;
  for (const event of events) {
    const opened = event.type === 'opened';
    const title = opened ? `↩ ${event.symbol} dönüş işlemi açıldı` : `📊 ${event.symbol} dönüş işlemi kapandı`;
    const body = opened ? `Katı günlük dönüş teyitleri geçti. Sanal giriş: ₺${event.price}` : `${event.reason} • Sonuç: ${event.pnl >= 0 ? '+' : ''}₺${event.pnl}`;
    await getMessaging().sendEachForMulticast({
      tokens, notification: { title, body },
      data: { type: 'bist-reversal-paper', symbol: event.symbol, url: '/senkron-panel#reversal' },
      webpush: {
        fcmOptions: { link: `${baseUrl}/senkron-panel#reversal` },
        notification: { icon: '/icon-192.png', badge: '/icon-192.png', tag: `reversal-${event.symbol}-${event.type}` },
      },
    });
  }
}

export async function GET(request) {
  try {
    if (request.headers.get('authorization') !== `Bearer ${process.env.ALERT_CRON_SECRET}`) {
      return NextResponse.json({ error: 'Yetkisiz erişim.' }, { status: 401 });
    }
    const clock = istanbulClock();
    if (!clock.isWeekday || !clock.inWindow) {
      return NextResponse.json({ ok: true, skipped: true, reason: 'Dönüş robotu seans sonrası kontrol saati dışında.', clock });
    }
    adminApp();
    const db = getFirestore();
    const baseUrl = process.env.APP_URL || 'https://finans-paneli-amber.vercel.app';
    const scanResponse = await fetch(`${baseUrl}/api/bist-reversal?refresh=1`, { cache: 'no-store' });
    const scan = await scanResponse.json();
    if (!scanResponse.ok || !scan?.ok) throw new Error(scan?.error || `Dönüş radarı HTTP ${scanResponse.status}`);
    const users = await db.collection('users').get();
    let active = 0, changed = 0, opened = 0, closed = 0;
    for (const userDoc of users.docs) {
      const ref = userDoc.ref.collection('paperTrading').doc(ROBOT_ID);
      const snapshot = await ref.get();
      if (!snapshot.exists || snapshot.data()?.active !== true) continue;
      active += 1;
      const result = processRobot(snapshot.data(), scan, clock);
      if (!result.changed) continue;
      await ref.set(result.next, { merge: true });
      changed += 1;
      opened += result.events.filter((event) => event.type === 'opened').length;
      closed += result.events.filter((event) => event.type === 'closed').length;
      try { await notify(userDoc.ref, result.events, baseUrl); } catch (error) { console.error('Dönüş robotu bildirimi:', error); }
    }
    return NextResponse.json({ ok: true, activeRobots: active, updatedRobots: changed, opened, closed, analyzed: scan.analyzed, generatedAt: new Date().toISOString(), clock });
  } catch (error) {
    console.error('BIST dönüş robotu:', error);
    return NextResponse.json({ ok: false, error: error?.message || 'Dönüş robotu çalıştırılamadı.' }, { status: 500 });
  }
}
