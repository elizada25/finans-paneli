'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { firestoreDb } from '../../../lib-firebase';

const STORAGE_KEY = 'sky-bist-paper-robot-v1';
const STARTING_CASH = 100000;
const TEST_DAYS = 30;

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
    lastRunAt: null,
    updatedAt: null,
  };
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(number(value) * factor) / factor;
}

function money(value) {
  return `${number(value).toLocaleString('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} TL`;
}

function shortDate(value, includeTime = false) {
  if (!value) return '-';

  return new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'Europe/Istanbul',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...(includeTime
      ? {
          hour: '2-digit',
          minute: '2-digit',
        }
      : {}),
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

function readLocalRobot() {
  try {
    const saved = JSON.parse(
      localStorage.getItem(STORAGE_KEY)
    );

    if (
      !saved ||
      typeof saved !== 'object' ||
      !saved.startedAt
    ) {
      return null;
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
    return null;
  }
}

export default function BistPaperRobot({ user }) {
  const [robot, setRobot] = useState(initialRobot);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [syncStatus, setSyncStatus] = useState(
    'Firebase bağlantısı hazırlanıyor…'
  );
  const migrationAttempted = useRef(false);

  useEffect(() => {
    if (!user?.uid) return undefined;

    migrationAttempted.current = false;

    const robotRef = doc(
      firestoreDb,
      'users',
      user.uid,
      'paperTrading',
      'bist30Day'
    );

    const unsubscribe = onSnapshot(
      robotRef,
      async (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();

          setRobot({
            ...initialRobot(),
            ...data,
            positions: Array.isArray(data.positions)
              ? data.positions
              : [],
            trades: Array.isArray(data.trades)
              ? data.trades
              : [],
            dailyEntries:
              data.dailyEntries &&
              typeof data.dailyEntries === 'object'
                ? data.dailyEntries
                : {},
          });

          localStorage.removeItem(STORAGE_KEY);
          setSyncStatus(
            'Firebase ile eşitlendi'
          );
          setReady(true);
          return;
        }

        if (migrationAttempted.current) {
          setReady(true);
          return;
        }

        migrationAttempted.current = true;
        const localRobot = readLocalRobot();

        if (localRobot) {
          setSyncStatus(
            'Bu cihazdaki test Firebase’e aktarılıyor…'
          );

          try {
            await setDoc(robotRef, {
              ...localRobot,
              storageMode: 'firestore',
              migratedFromDeviceAt:
                new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });

            localStorage.removeItem(STORAGE_KEY);
          } catch (error) {
            console.error(
              'Robot aktarım hatası:',
              error
            );
            setSyncStatus(
              `Aktarım hatası: ${
                error?.message || 'Bilinmeyen hata'
              }`
            );
            setReady(true);
          }

          return;
        }

        setRobot(initialRobot());
        setSyncStatus(
          'Firebase hazır • Henüz test başlatılmadı'
        );
        setReady(true);
      },
      (error) => {
        console.error(
          'Robot senkronizasyon hatası:',
          error
        );
        setSyncStatus(
          `Firebase hatası: ${
            error?.message || 'Bağlantı kurulamadı'
          }`
        );
        setReady(true);
      }
    );

    return unsubscribe;
  }, [user?.uid]);

  const robotRef = useMemo(() => {
    if (!user?.uid) return null;

    return doc(
      firestoreDb,
      'users',
      user.uid,
      'paperTrading',
      'bist30Day'
    );
  }, [user?.uid]);

  const equity = useMemo(
    () => totalEquity(robot),
    [robot]
  );

  const profitLoss =
    equity - number(robot.initialCash);

  const winningTrades = (
    robot.trades || []
  ).filter(
    (trade) => number(trade.profitLoss) > 0
  ).length;

  async function startTest() {
    if (!robotRef) return;

    const accepted = window.confirm(
      '100.000 TL sanal sermayeyle 30 günlük sunucu testini başlatalım mı?\n\nTelefon veya bilgisayar açık kalmak zorunda değildir. Gerçek emir gönderilmez.'
    );

    if (!accepted) return;

    const startedAt = new Date();
    const endsAt = new Date(
      startedAt.getTime() +
        TEST_DAYS * 24 * 60 * 60 * 1000
    );

    await setDoc(robotRef, {
      ...initialRobot(),
      active: true,
      startedAt: startedAt.toISOString(),
      endsAt: endsAt.toISOString(),
      storageMode: 'firestore',
      createdAt: startedAt.toISOString(),
      updatedAt: startedAt.toISOString(),
    });
  }

  async function stopTest() {
    if (!robotRef) return;

    const accepted = window.confirm(
      'Robotu durdurmak istiyor musunuz?\n\nAçık sanal pozisyonlar silinmeyecek.'
    );

    if (!accepted) return;

    await updateDoc(robotRef, {
      active: false,
      stoppedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  async function resetTest() {
    if (!robotRef) return;

    const accepted = window.confirm(
      'Bütün sanal işlem geçmişi ve sonuçlar sıfırlanacak. Emin misiniz?'
    );

    if (!accepted) return;

    await setDoc(robotRef, {
      ...initialRobot(),
      storageMode: 'firestore',
      resetAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    localStorage.removeItem(STORAGE_KEY);
  }

  if (!ready) {
    return (
      <div style={styles.loading}>
        🤖 {syncStatus}
      </div>
    );
  }

  return (
    <div style={styles.robotWrap}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        style={styles.robotHeader}
      >
        <div>
          <strong style={styles.robotTitle}>
            🤖 30 Günlük Sunucu Trade Robotu
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
          <div style={styles.syncLine}>
            <span style={styles.syncDot} />
            {syncStatus}
          </div>

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
          </div>

          <div style={styles.stats}>
            <Stat
              label="Başlangıç"
              value={money(robot.initialCash)}
            />
            <Stat
              label="Nakit"
              value={money(robot.cash)}
            />
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

          <div style={styles.lastRun}>
            <strong>Son sunucu kontrolü:</strong>{' '}
            {shortDate(robot.lastRunAt, true)}
            {robot.lastSessionDate
              ? ` • Seans ${robot.lastSessionDate}`
              : ''}
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
              Açık sanal pozisyon yok. Robot sadece
              güçlü “İŞLEM SİNYALİ” oluşursa alım yapar.
            </p>
          )}

          <h4 style={styles.subheading}>
            Sonuçlanan İşlemler
          </h4>

          {robot.trades.length ? (
            <div style={styles.history}>
              {robot.trades
                .slice(0, 20)
                .map((trade) => (
                  <div
                    key={trade.id}
                    style={styles.historyRow}
                  >
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
                      %{number(
                        trade.returnPercent
                      ).toFixed(2)}
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
            Robot GitHub Actions ve Firebase üzerinden
            çalışır. Telefon veya bilgisayar açık kalmak
            zorunda değildir. Gerçek emir göndermez.
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
  loading: {
    marginTop: '16px',
    padding: '14px',
    borderRadius: '12px',
    color: '#7dd3fc',
    background: 'rgba(56,189,248,0.07)',
    border: '1px solid rgba(56,189,248,0.20)',
    fontSize: '12px',
  },
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
      'linear-gradient(135deg, rgba(14,116,144,0.15), rgba(52,211,153,0.08))',
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
    color: '#6ee7b7',
    fontSize: '12px',
  },
  robotBody: {
    padding: '15px',
    borderTop: '1px solid rgba(148,163,184,0.12)',
  },
  syncLine: {
    display: 'flex',
    alignItems: 'center',
    gap: '7px',
    marginBottom: '11px',
    color: '#86efac',
    fontSize: '10px',
  },
  syncDot: {
    width: '7px',
    height: '7px',
    borderRadius: '50%',
    background: '#4ade80',
    boxShadow: '0 0 10px #4ade80',
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
    gap: '7px 13px',
    marginTop: '11px',
    color: '#94a3b8',
    fontSize: '10px',
  },
  lastRun: {
    marginTop: '11px',
    padding: '9px',
    borderRadius: '9px',
    color: '#bfdbfe',
    background: 'rgba(59,130,246,0.08)',
    fontSize: '10px',
  },
  subheading: {
    margin: '16px 0 9px',
    color: '#6ee7b7',
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
      'minmax(55px,.5fr) minmax(55px,.5fr) minmax(150px,1.5fr) minmax(120px,1fr)',
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
