'use client';

import { useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'sky-bist-paper-robot-v1';
const STARTING_CASH = 100000;
const TEST_DAYS = 30;
const MAX_OPEN_POSITIONS = 3;
const MAX_DAILY_ENTRIES = 3;
const RISK_PER_TRADE = 1000;
const MAX_POSITION_RATE = 0.30;
const CASH_RESERVE_RATE = 0.10;
const COMMISSION_RATE = 0.0015;
const SLIPPAGE_RATE = 0.0005;

function initialRobot() {
  return {
    active: false,
    startedAt: null,
    endsAt: null,
    initialCash: STARTING_CASH,
    cash: STARTING_CASH,
    positions: [],
    trades: [],
    dailyEntries: {},
    lastProcessed: null,
  };
}

function number(value) {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(number(value) * factor) / factor;
}

function dateKey(value = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value);
}

function money(value) {
  return `${number(value).toLocaleString('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} TL`;
}

function shortDate(value) {
  if (!value) return '-';

  return new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'Europe/Istanbul',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

function loadRobot() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));

    if (!saved || typeof saved !== 'object') {
      return initialRobot();
    }

    return {
      ...initialRobot(),
      ...saved,
      positions: Array.isArray(saved.positions)
        ? saved.positions
        : [],
      trades: Array.isArray(saved.trades)
        ? saved.trades
        : [],
      dailyEntries:
        saved.dailyEntries &&
        typeof saved.dailyEntries === 'object'
          ? saved.dailyEntries
          : {},
    };
  } catch {
    return initialRobot();
  }
}

function totalEquity(robot) {
  return (
    number(robot.cash) +
    robot.positions.reduce(
      (total, position) =>
        total +
        number(position.quantity) *
          number(position.lastPrice || position.entryPrice),
      0
    )
  );
}

function closePosition(robot, position, price, reason, timestamp) {
  const grossSale =
    number(position.quantity) *
    number(price) *
    (1 - SLIPPAGE_RATE);

  const saleCommission = grossSale * COMMISSION_RATE;
  const netSale = grossSale - saleCommission;
  const totalCost =
    number(position.cost) +
    number(position.buyCommission);

  const profitLoss = netSale - totalCost;

  robot.cash = round(number(robot.cash) + netSale);
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
        ? round((profitLoss / totalCost) * 100)
        : 0,
  });
}

function processScan(current, scan) {
  if (
    !current.active ||
    !scan?.generatedAt ||
    current.lastProcessed === scan.generatedAt
  ) {
    return current;
  }

  const next = {
    ...current,
    positions: current.positions.map((position) => ({
      ...position,
    })),
    trades: [...current.trades],
    dailyEntries: { ...current.dailyEntries },
    lastProcessed: scan.generatedAt,
  };

  const checks = new Map(
    (scan.positionChecks || []).map((item) => [
      item.symbol,
      item,
    ])
  );

  const now = new Date(scan.generatedAt);
  const expired =
    next.endsAt &&
    now.getTime() >= new Date(next.endsAt).getTime();

  const remainingPositions = [];

  for (const position of next.positions) {
    const check = checks.get(position.symbol);

    if (!check || !number(check.price)) {
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
      number(updated.stop) < number(position.entryPrice)
    ) {
      updated.stop = position.entryPrice;
      updated.stopMovedToEntry = true;
    }

    let exitReason = '';

    if (expired) {
      exitReason = '30 günlük test süresi tamamlandı';
    } else if (currentPrice <= number(updated.stop)) {
      exitReason = updated.stopMovedToEntry
        ? 'Maliyet stopu çalıştı'
        : 'Koruyucu stop çalıştı';
    } else if (currentPrice >= number(position.target2)) {
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
    }

    return next;
  }

  const today = dateKey(now);
  let todayCount = number(next.dailyEntries[today]);

  const candidates = (scan.items || []).filter(
    (item) => item.setup === 'İŞLEM SİNYALİ'
  );

  for (const item of candidates) {
    if (
      next.positions.length >= MAX_OPEN_POSITIONS ||
      todayCount >= MAX_DAILY_ENTRIES
    ) {
      break;
    }

    if (
      next.positions.some(
        (position) => position.symbol === item.symbol
      )
    ) {
      continue;
    }

    const alreadyTradedToday = next.trades.some(
      (trade) =>
        trade.symbol === item.symbol &&
        dateKey(new Date(trade.closedAt)) === today
    );

    if (alreadyTradedToday) continue;

    const entry = number(item.entry);
    const riskPerShare = number(item.riskPerShare);

    if (entry <= 0 || riskPerShare <= 0) continue;

    const equity = totalEquity(next);
    const reserve = equity * CASH_RESERVE_RATE;
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
        (entry *
          (1 + SLIPPAGE_RATE) *
          (1 + COMMISSION_RATE))
    );

    const quantity = Math.max(
      0,
      Math.min(riskLot, allocationLot, cashLot)
    );

    if (quantity < 1) continue;

    const executionPrice =
      entry * (1 + SLIPPAGE_RATE);

    const cost = quantity * executionPrice;
    const buyCommission = cost * COMMISSION_RATE;
    const totalDebit = cost + buyCommission;

    if (totalDebit > next.cash) continue;

    next.cash = round(next.cash - totalDebit);
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

  next.dailyEntries[today] = todayCount;
  return next;
}

export default function BistPaperRobot({
  scan,
  scanning,
}) {
  const [robot, setRobot] = useState(initialRobot);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setRobot(loadRobot());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(robot)
    );
  }, [ready, robot]);

  useEffect(() => {
    if (!ready || !scan) return;

    setRobot((current) =>
      processScan(current, scan)
    );
  }, [ready, scan]);

  const equity = useMemo(
    () => totalEquity(robot),
    [robot]
  );

  const profitLoss =
    equity - number(robot.initialCash);

  const winningTrades = robot.trades.filter(
    (trade) => number(trade.profitLoss) > 0
  ).length;

  function startTest() {
    const accepted = window.confirm(
      '100.000 TL sanal sermayeyle 30 günlük testi başlatalım mı?\n\nGerçek emir gönderilmeyecektir.'
    );

    if (!accepted) return;

    const startedAt = new Date();
    const endsAt = new Date(
      startedAt.getTime() +
        TEST_DAYS * 24 * 60 * 60 * 1000
    );

    setRobot({
      ...initialRobot(),
      active: true,
      startedAt: startedAt.toISOString(),
      endsAt: endsAt.toISOString(),
    });

    setOpen(true);
  }

  function stopTest() {
    const accepted = window.confirm(
      'Robotu durdurmak istiyor musunuz?\n\nAçık sanal pozisyonlar silinmez; yalnızca yeni işlem açılması durur.'
    );

    if (!accepted) return;

    setRobot((current) => ({
      ...current,
      active: false,
    }));
  }

  function resetTest() {
    const accepted = window.confirm(
      'Sanal robotun bütün işlem geçmişi ve sonuçları silinecek. Emin misiniz?'
    );

    if (!accepted) return;
    setRobot(initialRobot());
  }

  if (!ready) return null;

  return (
    <div style={styles.robotWrap}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        style={styles.robotHeader}
      >
        <div>
          <strong style={styles.robotTitle}>
            🤖 30 Günlük Sanal Trade Robotu
          </strong>
          <span style={styles.robotSubtitle}>
            {robot.active
              ? `${robot.positions.length}/3 açık pozisyon • ${money(equity)}`
              : robot.startedAt
                ? `Test durdu • Son değer ${money(equity)}`
                : '100.000 TL sanal sermaye ile test edilmedi'}
          </span>
        </div>

        <span style={styles.openIcon}>
          {open ? '▲' : '▼'}
        </span>
      </button>

      {open ? (
        <div style={styles.robotBody}>
          <div style={styles.actionLine}>
            {!robot.startedAt ? (
              <button
                type="button"
                onClick={startTest}
                style={styles.startButton}
              >
                30 Günlük Testi Başlat
              </button>
            ) : robot.active ? (
              <button
                type="button"
                onClick={stopTest}
                style={styles.stopButton}
              >
                Robotu Durdur
              </button>
            ) : (
              <button
                type="button"
                onClick={startTest}
                style={styles.startButton}
              >
                Yeni Test Başlat
              </button>
            )}

            <button
              type="button"
              onClick={resetTest}
              style={styles.resetButton}
            >
              Sonuçları Sıfırla
            </button>

            <span style={styles.scanState}>
              {scanning
                ? 'Robot yeni sinyalleri kontrol ediyor…'
                : robot.active
                  ? 'Her taramada otomatik çalışır'
                  : 'Robot şu anda pasif'}
            </span>
          </div>

          <div style={styles.stats}>
            <Stat
              label="Başlangıç"
              value={money(robot.initialCash)}
            />
            <Stat label="Nakit" value={money(robot.cash)} />
            <Stat
              label="Toplam değer"
              value={money(equity)}
            />
            <Stat
              label="Kâr / zarar"
              value={money(profitLoss)}
              tone={profitLoss >= 0 ? 'green' : 'red'}
            />
            <Stat
              label="Açık işlem"
              value={`${robot.positions.length}/3`}
            />
            <Stat
              label="Başarı"
              value={
                robot.trades.length
                  ? `%${round(
                      (winningTrades /
                        robot.trades.length) *
                        100,
                      1
                    )}`
                  : '-'
              }
            />
          </div>

          <div style={styles.testInfo}>
            <span>
              Başlangıç: {shortDate(robot.startedAt)}
            </span>
            <span>
              Test bitişi: {shortDate(robot.endsAt)}
            </span>
            <span>Günlük en fazla 3 alış</span>
            <span>Hisse başına en fazla %30</span>
            <span>En az %10 nakit</span>
            <span>İşlem riski en fazla 1.000 TL</span>
          </div>

          <h4 style={styles.subheading}>
            Açık Sanal Pozisyonlar
          </h4>

          {robot.positions.length ? (
            <div style={styles.positionGrid}>
              {robot.positions.map((position) => {
                const marketValue =
                  number(position.quantity) *
                  number(position.lastPrice);

                const positionPnl =
                  marketValue -
                  number(position.cost) -
                  number(position.buyCommission);

                return (
                  <article
                    key={position.symbol}
                    style={styles.positionCard}
                  >
                    <div style={styles.positionTop}>
                      <strong>{position.symbol}</strong>
                      <span
                        style={{
                          color:
                            positionPnl >= 0
                              ? '#4ade80'
                              : '#f87171',
                        }}
                      >
                        {money(positionPnl)}
                      </span>
                    </div>

                    <div style={styles.positionDetails}>
                      <span>
                        {position.quantity} lot
                      </span>
                      <span>
                        Alış {money(position.entryPrice)}
                      </span>
                      <span>
                        Son {money(position.lastPrice)}
                      </span>
                      <span>
                        Stop {money(position.stop)}
                      </span>
                      <span>
                        Hedef {money(position.target2)}
                      </span>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <p style={styles.emptyText}>
              Açık sanal pozisyon yok. Robot yalnızca
              “İŞLEM SİNYALİ” oluşursa alım yapar.
            </p>
          )}

          <h4 style={styles.subheading}>
            Sonuçlanan İşlemler
          </h4>

          {robot.trades.length ? (
            <div style={styles.history}>
              {robot.trades.slice(0, 20).map((trade) => (
                <div key={trade.id} style={styles.historyRow}>
                  <strong>{trade.symbol}</strong>
                  <span>{trade.quantity} lot</span>
                  <span>{trade.reason}</span>
                  <span
                    style={{
                      color:
                        trade.profitLoss >= 0
                          ? '#4ade80'
                          : '#f87171',
                    }}
                  >
                    {money(trade.profitLoss)}
                    {' • '}
                    %{number(trade.returnPercent).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p style={styles.emptyText}>
              Henüz sonuçlanan sanal işlem yok.
            </p>
          )}

          <p style={styles.warning}>
            Robot yalnızca sanal kayıt oluşturur. Gerçek
            alım-satım emri göndermez. Komisyon ve kayma
            yaklaşık olarak hesaba katılır.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function Stat({ label, value, tone }) {
  const color =
    tone === 'green'
      ? '#4ade80'
      : tone === 'red'
        ? '#f87171'
        : '#f8fafc';

  return (
    <div style={styles.statCard}>
      <span>{label}</span>
      <strong style={{ color }}>{value}</strong>
    </div>
  );
}

const styles = {
  robotWrap: {
    marginTop: '16px',
    overflow: 'hidden',
    borderRadius: '14px',
    border: '1px solid rgba(56,189,248,0.24)',
    background: 'rgba(7,13,22,0.62)',
  },
  robotHeader: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '14px',
    padding: '15px',
    border: 0,
    color: '#f8fafc',
    background:
      'linear-gradient(135deg, rgba(14,116,144,0.15), rgba(212,175,55,0.08))',
    textAlign: 'left',
    cursor: 'pointer',
  },
  robotTitle: {
    display: 'block',
    color: '#7dd3fc',
    fontSize: '15px',
  },
  robotSubtitle: {
    display: 'block',
    marginTop: '5px',
    color: '#94a3b8',
    fontSize: '11px',
  },
  openIcon: {
    color: '#f0d675',
    fontSize: '12px',
  },
  robotBody: {
    padding: '15px',
    borderTop: '1px solid rgba(148,163,184,0.12)',
  },
  actionLine: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '9px',
  },
  startButton: {
    minHeight: '38px',
    padding: '0 14px',
    border: 0,
    borderRadius: '9px',
    color: '#111827',
    background: '#4ade80',
    fontWeight: 900,
    cursor: 'pointer',
  },
  stopButton: {
    minHeight: '38px',
    padding: '0 14px',
    border: 0,
    borderRadius: '9px',
    color: '#fff',
    background: '#dc2626',
    fontWeight: 900,
    cursor: 'pointer',
  },
  resetButton: {
    minHeight: '38px',
    padding: '0 14px',
    border: '1px solid rgba(148,163,184,0.22)',
    borderRadius: '9px',
    color: '#cbd5e1',
    background: 'rgba(255,255,255,0.04)',
    fontWeight: 800,
    cursor: 'pointer',
  },
  scanState: {
    color: '#94a3b8',
    fontSize: '11px',
  },
  stats: {
    display: 'grid',
    gridTemplateColumns:
      'repeat(auto-fit, minmax(135px, 1fr))',
    gap: '8px',
    marginTop: '13px',
  },
  statCard: {
    padding: '11px',
    borderRadius: '10px',
    background: 'rgba(255,255,255,0.035)',
    border: '1px solid rgba(148,163,184,0.11)',
    color: '#94a3b8',
    fontSize: '10px',
  },
  testInfo: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '7px',
    marginTop: '11px',
    color: '#94a3b8',
    fontSize: '10px',
  },
  subheading: {
    margin: '16px 0 9px',
    color: '#e6c65c',
    fontSize: '12px',
  },
  positionGrid: {
    display: 'grid',
    gridTemplateColumns:
      'repeat(auto-fit, minmax(240px, 1fr))',
    gap: '8px',
  },
  positionCard: {
    padding: '11px',
    borderRadius: '10px',
    background: 'rgba(15,23,42,0.75)',
    border: '1px solid rgba(56,189,248,0.17)',
  },
  positionTop: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '10px',
    color: '#f8fafc',
  },
  positionDetails: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px 10px',
    marginTop: '8px',
    color: '#94a3b8',
    fontSize: '10px',
  },
  history: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  historyRow: {
    display: 'grid',
    gridTemplateColumns:
      'minmax(55px,0.5fr) minmax(55px,0.5fr) minmax(150px,1.5fr) minmax(120px,1fr)',
    gap: '8px',
    padding: '9px',
    borderRadius: '8px',
    color: '#cbd5e1',
    background: 'rgba(255,255,255,0.03)',
    fontSize: '10px',
  },
  emptyText: {
    margin: 0,
    color: '#64748b',
    fontSize: '11px',
  },
  warning: {
    margin: '15px 0 0',
    color: '#64748b',
    fontSize: '10px',
    lineHeight: 1.5,
  },
};
