'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { addDoc, collection, deleteDoc, doc, onSnapshot, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { firebaseAuth, firestoreDb } from '../../lib-firebase';
import ScannerCenter from './components/ScannerCenter';
import SkyAI from './components/SkyAI';
import NotificationButton from './components/NotificationButton';
import OptionsPressureModal from './components/OptionsPressureModal';
import BistTradeCenter from './components/BistTradeCenter';
import NasdaqSectorFlow from './components/NasdaqSectorFlow';
import StickyNote from './components/StickyNote';
import GlobalMarkets from './components/GlobalMarkets';
import PersonalFinance from './components/PersonalFinance';
import BistWatchlist from './components/BistWatchlist';
import BistReversalCenter from './components/BistReversalCenter';
import ChartWorkspace from './components/ChartWorkspace';
import BtcCenter from './components/BtcCenter';
import NasdaqFourHourRadar from './components/NasdaqFourHourRadar';
import MobileLayoutStyles from './components/MobileLayoutStyles';
export default function SenkronPanelPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [stocks, setStocks] = useState([]);
  const [closedPositions, setClosedPositions] = useState([]);
  const [watchlist, setWatchlist] = useState([]);
  const [prices, setPrices] = useState({});
  const [status, setStatus] = useState('Portföy yükleniyor…');
  const [priceStatus, setPriceStatus] = useState('');
  const [usdTry, setUsdTry] = useState(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [selectedOptionsStock, setSelectedOptionsStock] = useState(null);
  const [activeSection, setActiveSection] = useState('overview');
  const [istanbulClock, setIstanbulClock] = useState('');

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (['nasdaq-4h', 'reversal'].includes(hash)) {
      setActiveSection(hash);
    }
  }, []);

  useEffect(() => {
    function updateIstanbulClock() {
      setIstanbulClock(
        new Intl.DateTimeFormat('tr-TR', {
          timeZone: 'Europe/Istanbul',
          weekday: 'short',
          day: '2-digit',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hourCycle: 'h23',
        }).format(new Date())
      );
    }

    updateIstanbulClock();

    const clockTimer = window.setInterval(
      updateIstanbulClock,
      1000
    );

    return () => window.clearInterval(clockTimer);
  }, []);

  useEffect(() => {
    let unsubscribePortfolio = null;
    let unsubscribeClosed = null;
    let unsubscribeWatchlist = null;

    const unsubscribeAuth = onAuthStateChanged(firebaseAuth, (currentUser) => {
      if (unsubscribePortfolio) {
        unsubscribePortfolio();
        unsubscribePortfolio = null;
      }

      if (unsubscribeClosed) {
        unsubscribeClosed();
        unsubscribeClosed = null;
      }

      if (unsubscribeWatchlist) {
        unsubscribeWatchlist();
        unsubscribeWatchlist = null;
      }

      if (!currentUser) {
        setUser(null);
        setStocks([]);
        setClosedPositions([]);
        setWatchlist([]);
        setStatus('Giriş ekranına yönlendiriliyor…');
        router.replace('/login?next=/senkron-panel');
        return;
      }

      setUser(currentUser);
      setStatus('Firestore portföyü yükleniyor…');

      const portfolioRef = collection(
        firestoreDb,
        'users',
        currentUser.uid,
        'portfolio'
      );

      unsubscribePortfolio = onSnapshot(
        portfolioRef,
        (snapshot) => {
          const items = snapshot.docs.map((item) => ({
            id: item.id,
            ...item.data(),
          }));

          items.sort((a, b) =>
            String(a.code || '').localeCompare(String(b.code || ''))
          );

          setStocks(items);
          setStatus('');
        },
        (error) => {
          console.error('Portföy yükleme hatası:', error);
          setStatus(`Portföy yüklenemedi: ${error.message}`);
        }
      );


      const closedRef = collection(
        firestoreDb,
        'users',
        currentUser.uid,
        'closed'
      );

      unsubscribeClosed = onSnapshot(
        closedRef,
        (snapshot) => {
          const items = snapshot.docs.map((item) => ({
            id: item.id,
            ...item.data(),
          }));

          items.sort((a, b) =>
            String(b.closedAt || '').localeCompare(String(a.closedAt || ''))
          );

          setClosedPositions(items);
        },
        (error) => {
          console.error('Kapanan pozisyon yükleme hatası:', error);
        }
      );

      const watchlistRef = collection(
        firestoreDb,
        'users',
        currentUser.uid,
        'watchlist'
      );

      unsubscribeWatchlist = onSnapshot(
        watchlistRef,
        (snapshot) => {
          const items = snapshot.docs.map((item) => ({
            id: item.id,
            ...item.data(),
          }));

          items.sort((a, b) => {
            const orderA = Number.isFinite(Number(a.order))
              ? Number(a.order)
              : Number.MAX_SAFE_INTEGER;
            const orderB = Number.isFinite(Number(b.order))
              ? Number(b.order)
              : Number.MAX_SAFE_INTEGER;

            if (orderA !== orderB) return orderA - orderB;

            return String(a.createdAt || '').localeCompare(
              String(b.createdAt || '')
            );
          });

          setWatchlist(items);
        },
        (error) => {
          console.error('Takip listesi yükleme hatası:', error);
        }
      );
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribePortfolio) unsubscribePortfolio();
      if (unsubscribeClosed) unsubscribeClosed();
      if (unsubscribeWatchlist) unsubscribeWatchlist();
    };
  }, [router]);

  const fetchLivePrices = useCallback(async () => {
    const priceStocks = [...stocks, ...watchlist];

    if (priceStocks.length === 0) {
      setPrices({});
      setPriceStatus('');
      return;
    }

    setPriceStatus('Canlı fiyatlar güncelleniyor…');

    try {
      const bistCodes = priceStocks
        .filter((stock) => stock.market === 'bist')
        .map((stock) => String(stock.code || '').trim().toUpperCase())
        .filter(Boolean);

      const usCodes = priceStocks
        .filter((stock) => stock.market === 'us')
        .map((stock) => String(stock.code || '').trim().toUpperCase())
        .filter(Boolean);

      const [bistData, usData] = await Promise.all([
        fetchPrices('bist', bistCodes),
        fetchPrices('us', usCodes),
      ]);

      setPrices({ ...bistData, ...usData });
      setPriceStatus(
        `Son güncelleme: ${new Date().toLocaleTimeString('tr-TR')}`
      );
    } catch (error) {
      console.error('Canlı fiyat güncelleme hatası:', error);
      setPriceStatus(
        `Canlı fiyat hatası: ${error?.message || 'Bilinmeyen hata'}`
      );
    }
  }, [stocks, watchlist]);

  useEffect(() => {
    if (stocks.length === 0 && watchlist.length === 0) return;

    fetchLivePrices();
    const timer = setInterval(fetchLivePrices, 30000);
    return () => clearInterval(timer);
  }, [stocks, watchlist, fetchLivePrices]);

  const fetchUsdTry = useCallback(async () => {
    try {
      const response = await fetch('/api/fx', {
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error(`USD/TRY servisi: ${response.status}`);
      }

      const data = await response.json();
      const rate = Number(data?.rate);

      if (!Number.isFinite(rate) || rate <= 0) {
        throw new Error('Geçerli USD/TRY kuru alınamadı.');
      }

      setUsdTry(rate);
    } catch (error) {
      console.error('USD/TRY kuru alınamadı:', error);
    }
  }, []);

  useEffect(() => {
    fetchUsdTry();

    const timer = setInterval(fetchUsdTry, 60000);
    return () => clearInterval(timer);
  }, [fetchUsdTry]);

  const bistStocks = useMemo(
    () => stocks.filter((stock) => stock.market === 'bist'),
    [stocks]
  );

  const usStocks = useMemo(
    () => stocks.filter((stock) => stock.market === 'us'),
    [stocks]
  );

  const bistSummary = useMemo(
    () => calculateSummary(bistStocks, prices),
    [bistStocks, prices]
  );

  const bistDailySummary = useMemo(
    () => calculateDailySummary(bistStocks, prices),
    [bistStocks, prices]
  );

  const usSummary = useMemo(
    () => calculateSummary(usStocks, prices),
    [usStocks, prices]
  );

  const usDailySummary = useMemo(
    () => calculateDailySummary(usStocks, prices),
    [usStocks, prices]
  );

  const totalPortfolioProfitLossTry = useMemo(() => {
    if (!Number.isFinite(usdTry) || usdTry <= 0) return null;

    return (
      Number(bistSummary.profitLoss || 0) +
      Number(usSummary.profitLoss || 0) * usdTry
    );
  }, [bistSummary.profitLoss, usSummary.profitLoss, usdTry]);

  async function logout() {
    setLoggingOut(true);
    try {
      await signOut(firebaseAuth);
      await fetch('/api/logout', { method: 'POST' });
    } catch (error) {
      console.error('Çıkış hatası:', error);
    } finally {
      router.replace('/login');
      router.refresh();
    }
  }

  if (!user) {
    return (
      <main style={styles.loadingPage}>
        <div style={styles.loadingCard}>
          <h2 style={styles.loadingTitle}>Finans Paneli</h2>
          <p style={styles.statusText}>{status}</p>
        </div>
      </main>
    );
  }

 return (
  <main style={styles.page}>
    <header style={styles.header}>
      <div>
        <p style={styles.smallLabel}>SKY FİNANS</p>

        <h1 style={styles.pageTitle}>
          Finans Kontrol Merkezi
        </h1>

        <p style={styles.userText}>{user.email}</p>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: '10px',
          flexWrap: 'wrap',
        }}
      >
        <div
          title="Türkiye saati"
          style={{
            minHeight: '42px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            justifyContent: 'center',
            padding: '0 13px',
            borderRadius: '10px',
            border: '1px solid rgba(56,189,248,0.24)',
            background: 'rgba(56,189,248,0.07)',
            whiteSpace: 'nowrap',
          }}
        >
          <span
            style={{
              color: '#7dd3fc',
              fontSize: '9px',
              fontWeight: 900,
              letterSpacing: '0.8px',
            }}
          >
            İSTANBUL
          </span>

          <strong
            style={{
              marginTop: '2px',
              color: '#f8fafc',
              fontSize: '12px',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {istanbulClock || '--'}
          </strong>
        </div>

        <button
          type="button"
          onClick={() => router.push('/haber-merkezi')}
          style={{
            minHeight: '42px',
            padding: '0 15px',
            borderRadius: '10px',
            border: '1px solid rgba(212,175,55,0.35)',
            background: 'rgba(212,175,55,0.10)',
            color: '#f0d675',
            fontSize: '12px',
            fontWeight: 900,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          📰 Haber Merkezi
        </button>

        <NotificationButton user={user} />

        <button
          type="button"
          onClick={logout}
          disabled={loggingOut}
          style={{
            ...styles.logoutButton,
            opacity: loggingOut ? 0.6 : 1,
          }}
        >
          {loggingOut ? 'Çıkış yapılıyor…' : 'Çıkış Yap'}
        </button>
      </div>
    </header>

    <MobileLayoutStyles />

    <nav
      aria-label="Panel bölümleri"
      style={{
        width: '100%',
        maxWidth: '1600px',
        margin: '0 auto 20px',
        padding: '9px',
        display: 'flex',
        alignItems: 'center',
        gap: '7px',
        overflowX: 'auto',
        border:
          '1px solid rgba(148,163,184,0.16)',
        borderRadius: '14px',
        background:
          'rgba(15,23,42,0.92)',
        boxSizing: 'border-box',
        scrollbarWidth: 'thin',
      }}
    >
      {[
        ['overview', '⌂ Özet'],
        ['portfolio', '▣ Portföy'],
        ['finance', '₺ Bütçe'],
        ['bist-watch', '▤ BIST Takip'],
        ['ai', '✦ SKY AI'],
        ['trade', '↗ Trade Merkezi'],
        ['market', '◉ NASDAQ'],
        ['btc', '₿ BTC Merkezi'],
        ['nasdaq-4h', '◫ NASDAQ 4H'],
        ['reversal', '↩ Dönüş Radarı'],
      ].map(([key, label]) => {
        const selected =
          activeSection === key;

        return (
          <button
            key={key}
            type="button"
            onClick={() =>
              setActiveSection(key)
            }
            aria-pressed={selected}
            style={{
              minHeight: '38px',
              padding: '0 13px',
              flex: '0 0 auto',
              order:
                key === 'btc'
                  ? 80
                  : key === 'nasdaq-4h'
                    ? 81
                    : key === 'reversal'
                      ? 82
                      : key === 'finance'
                        ? 90
                        : 0,
              border: selected
                ? '1px solid rgba(212,175,55,0.65)'
                : '1px solid rgba(148,163,184,0.15)',
              borderRadius: '9px',
              color: selected
                ? '#111827'
                : '#cbd5e1',
              background: selected
                ? 'linear-gradient(135deg,#d4af37,#f0d675)'
                : 'rgba(255,255,255,0.035)',
              fontFamily: 'inherit',
              fontSize: '14px',
              fontWeight: 900,
              whiteSpace: 'nowrap',
              cursor: 'pointer',
            }}
          >
            {label}
          </button>
        );
      })}

      <button
        type="button"
        onClick={() =>
          router.push('/sirket-analiz')
        }
        style={{
          minHeight: '38px',
          padding: '0 13px',
          flex: '0 0 auto',
          border:
            '1px solid rgba(56,189,248,0.28)',
          borderRadius: '9px',
          color: '#7dd3fc',
          background:
            'rgba(56,189,248,0.08)',
          fontFamily: 'inherit',
          fontSize: '14px',
          fontWeight: 900,
          whiteSpace: 'nowrap',
          cursor: 'pointer',
        }}
      >
        ◇ Şirket Analizi
      </button>
      <button
        type="button"
        onClick={() =>
          setActiveSection('global')
        }
        aria-pressed={
          activeSection === 'global'
        }
        style={{
          minHeight: '38px',
          padding: '0 13px',
          flex: '0 0 auto',
          border:
            activeSection === 'global'
              ? '1px solid rgba(212,175,55,0.65)'
              : '1px solid rgba(56,189,248,0.28)',
          borderRadius: '9px',
          color:
            activeSection === 'global'
              ? '#111827'
              : '#7dd3fc',
          background:
            activeSection === 'global'
              ? 'linear-gradient(135deg,#d4af37,#f0d675)'
              : 'rgba(56,189,248,0.07)',
          fontFamily: 'inherit',
          fontSize: '14px',
          fontWeight: 900,
          whiteSpace: 'nowrap',
          cursor: 'pointer',
        }}
      >
        ◈ Piyasalar
      </button>

      <button
        type="button"
        onClick={() =>
          setActiveSection('charts')
        }
        aria-pressed={
          activeSection === 'charts'
        }
        style={{
          minHeight: '38px',
          padding: '0 13px',
          flex: '0 0 auto',
          border:
            activeSection === 'charts'
              ? '1px solid rgba(212,175,55,0.65)'
              : '1px solid rgba(56,189,248,0.28)',
          borderRadius: '9px',
          color:
            activeSection === 'charts'
              ? '#111827'
              : '#7dd3fc',
          background:
            activeSection === 'charts'
              ? 'linear-gradient(135deg,#d4af37,#f0d675)'
              : 'rgba(56,189,248,0.07)',
          fontFamily: 'inherit',
          fontSize: '14px',
          fontWeight: 900,
          whiteSpace: 'nowrap',
          cursor: 'pointer',
        }}
      >
        ▦ Grafikler
      </button>

      <button
        type="button"
        onClick={() =>
          setActiveSection('notes')
        }
        aria-pressed={
          activeSection === 'notes'
        }
        style={{
          minHeight: '38px',
          padding: '0 13px',
          flex: '0 0 auto',
          order: 100,
          border:
            activeSection === 'notes'
              ? '1px solid rgba(212,175,55,0.65)'
              : '1px solid rgba(251,191,36,0.25)',
          borderRadius: '9px',
          color:
            activeSection === 'notes'
              ? '#111827'
              : '#fde68a',
          background:
            activeSection === 'notes'
              ? 'linear-gradient(135deg,#d4af37,#f0d675)'
              : 'rgba(251,191,36,0.07)',
          fontFamily: 'inherit',
          fontSize: '14px',
          fontWeight: 900,
          whiteSpace: 'nowrap',
          cursor: 'pointer',
        }}
      >
        📌 Notlar
      </button>
    </nav>

    {activeSection === 'btc' ? (
      <BtcCenter userId={user.uid} />
    ) : null}

    {activeSection === 'nasdaq-4h' ? (
      <NasdaqFourHourRadar userId={user.uid} />
    ) : null}

    {activeSection === 'finance' ? (
      <PersonalFinance
        userId={user.uid}
        liveUsdTry={usdTry}
      />
    ) : null}

    {activeSection === 'reversal' ? (
      <BistReversalCenter userId={user.uid} />
    ) : null}

    {activeSection === 'ai' ? (
      <SkyAI
        bistStocks={bistStocks}
        usStocks={usStocks}
        prices={prices}
        watchlist={watchlist}
      />
    ) : null}
    {activeSection === 'portfolio' ? (
      <>
    <section
  style={{
    marginTop: 18,
    marginBottom: 24,
    padding: 20,
    border: '1px solid #26364d',
    borderRadius: 20,
    background: '#18140d',
  }}
>
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 16,
      flexWrap: 'wrap',
    }}
  >
    <div>
      <h2
        style={{
          margin: 0,
          color: '#f8fafc',
          fontSize: 22,
        }}
      >
        Yeni Hisse Ekle
      </h2>

      <p
        style={{
          margin: '8px 0 0',
          color: '#94a3b8',
        }}
      >
        BIST veya NASDAQ hissesini portföyüne ekle.
      </p>
    </div>

    <button
      type="button"
      onClick={async () => {
        const marketInput = window.prompt(
          'Piyasa: BIST veya NASDAQ',
          'BIST'
        );

        if (marketInput === null) return;

        const marketText = String(marketInput)
          .trim()
          .toUpperCase();

        const market =
          marketText === 'BIST'
            ? 'bist'
            : ['NASDAQ', 'ABD', 'US'].includes(marketText)
              ? 'us'
              : '';

        if (!market) {
          window.alert('BIST veya NASDAQ yazmalısın.');
          return;
        }

        const codeInput = window.prompt('Hisse kodu:');
        if (codeInput === null) return;

        const code = String(codeInput)
          .trim()
          .toUpperCase();

        if (!code) {
          window.alert('Hisse kodu boş olamaz.');
          return;
        }

        const exists = stocks.some(
          (stock) =>
            String(stock.code || '')
              .trim()
              .toUpperCase() === code &&
            stock.market === market
        );

        if (exists) {
          window.alert(`${code} zaten portföyde.`);
          return;
        }

        const quantityInput = window.prompt('Lot/adet:');
        if (quantityInput === null) return;

        const quantity = toNumber(quantityInput);

        if (quantity <= 0) {
          window.alert('Lot/adet sıfırdan büyük olmalı.');
          return;
        }

        const costInput = window.prompt('Ortalama maliyet:');
        if (costInput === null) return;

        const costPrice = toNumber(costInput);

        if (costPrice <= 0) {
          window.alert('Maliyet sıfırdan büyük olmalı.');
          return;
        }

        try {
          await addDoc(
            collection(
              firestoreDb,
              'users',
              user.uid,
              'portfolio'
            ),
            {
              code,
              market,
              quantity,
              costPrice,
              createdAt: new Date().toISOString(),
            }
          );

          window.alert(`${code} portföye eklendi.`);
        } catch (error) {
          console.error('Hisse ekleme hatası:', error);

          window.alert(
            `Hisse eklenemedi: ${
              error?.message || 'Bilinmeyen hata'
            }`
          );
        }
      }}
      style={{
        border: '1px solid #0ea5e9',
        borderRadius: 14,
        padding: '12px 18px',
        background: '#075985',
        color: '#f8fafc',
        fontWeight: 800,
        cursor: 'pointer',
      }}
    >
      + Hisse Ekle
    </button>
  </div>
</section>
      </>
    ) : null}
      {status ? <div style={styles.infoBox}>{status}</div> : null}
      {activeSection === 'overview' ? (
        <>
      <section style={styles.summaryGrid}>
        <SummaryCard
          title="BIST Toplam Değer"
          value={formatMoney(bistSummary.currentValue, 'TRY')}
          subtitle={`${bistStocks.length} hisse`}
        />
        <SummaryCard
          title="BIST Kâr / Zarar"
          value={formatMoney(bistSummary.profitLoss, 'TRY')}
          subtitle={formatPercent(bistSummary.profitLossPercent)}
          positive={bistSummary.profitLoss >= 0}
        />
        <SummaryCard
          title="BIST Günlük K/Z"
          value={formatMoney(bistDailySummary.profitLoss, 'TRY')}
          subtitle={formatPercent(bistDailySummary.profitLossPercent)}
          positive={bistDailySummary.profitLoss >= 0}
        />
        <SummaryCard
          title="NASDAQ Toplam Değer"
          value={formatMoney(usSummary.currentValue, 'USD')}
          subtitle={`${usStocks.length} hisse`}
        />
        <SummaryCard
          title="NASDAQ Kâr / Zarar"
          value={formatMoney(usSummary.profitLoss, 'USD')}
          subtitle={formatPercent(usSummary.profitLossPercent)}
          positive={usSummary.profitLoss >= 0}
        />
        <SummaryCard
          title="NASDAQ Günlük K/Z"
          value={formatMoney(usDailySummary.profitLoss, 'USD')}
          subtitle={formatPercent(usDailySummary.profitLossPercent)}
          positive={usDailySummary.profitLoss >= 0}
        />
        <SummaryCard
          title="TOPLAM PORTFÖY K/Z"
          value={
            totalPortfolioProfitLossTry === null
              ? 'Kur bekleniyor…'
              : formatMoney(totalPortfolioProfitLossTry, 'TRY')
          }
          subtitle={
            usdTry
              ? `BIST + NASDAQ • USD/TRY ${usdTry.toLocaleString('tr-TR', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 4,
                })}`
              : 'USD/TRY yükleniyor…'
          }
          positive={
            totalPortfolioProfitLossTry === null
              ? undefined
              : totalPortfolioProfitLossTry >= 0
          }
        />
      </section>
        </>
      ) : null}

      <div style={styles.priceBar}>
        <span>{priceStatus || 'Canlı fiyat bekleniyor…'}</span>
        <button
          type="button"
          onClick={fetchLivePrices}
          style={styles.refreshButton}
        >
          Fiyatları Yenile
        </button>
      </div>
      {activeSection === 'portfolio' ? (
        <>
          <PortfolioSection
            title="BIST Portföyü"
            currency="TRY"
            stocks={bistStocks}
            prices={prices}
            userId={user.uid}
            onOpenOptions={setSelectedOptionsStock}
          />

          <PortfolioSection
            title="NASDAQ Portföyü"
            currency="USD"
            stocks={usStocks}
            prices={prices}
            userId={user.uid}
            onOpenOptions={setSelectedOptionsStock}
          />

          <section style={styles.dashboardPanels}>
            <ClosedPositionsPanel
              title="Kapanan BIST Pozisyonları"
              positions={closedPositions.filter(
                (position) => {
                  const market = String(
                    position.market ||
                    position.exchange ||
                    position.currency ||
                    ''
                  ).toLowerCase();

                  return (
                    market.includes('bist') ||
                    market.includes('try')
                  );
                }
              )}
              userId={user.uid}
            />

            <ClosedPositionsPanel
              title="Kapanan NASDAQ Pozisyonları"
              positions={closedPositions.filter(
                (position) => {
                  const market = String(
                    position.market ||
                    position.exchange ||
                    position.currency ||
                    ''
                  ).toLowerCase();

                  return (
                    market.includes('nasdaq') ||
                    market === 'us' ||
                    market.includes('usd')
                  );
                }
              )}
              userId={user.uid}
            />
          </section>
        </>
      ) : null}

      {activeSection === 'bist-watch' ? (
        <BistWatchlist userId={user.uid} />
      ) : null}

      {activeSection === 'overview' ? (
        <section
          style={{
            width: '100%',
            maxWidth: '1600px',
            margin: '0 0 28px',
          }}
        >
          <WatchlistPanel
            items={watchlist}
            prices={prices}
            userId={user.uid}
          />
        </section>
      ) : null}

      {activeSection === 'market' ? (
        <section style={styles.dashboardPanels}>
          <NewsPanel stocks={stocks} />
        </section>
      ) : null}

      {activeSection === 'global' ? (
        <GlobalMarkets />
      ) : null}

      {activeSection === 'charts' ? (
        <ChartWorkspace userId={user.uid} />
      ) : null}

      {activeSection === 'market' ? (
        <NasdaqSectorFlow />
      ) : null}

      {activeSection === 'trade' ? (
        <>
          <BistTradeCenter user={user} />
          <ScannerCenter />
        </>
      ) : null}

      {activeSection === 'notes' ? (
        <section
          style={{
            width: '100%',
            maxWidth: '1600px',
            margin: '0 auto 28px',
            display: 'flex',
            justifyContent: 'flex-start',
          }}
        >
          <StickyNote userId={user.uid} />
        </section>
      ) : null}

      {selectedOptionsStock && (
        <OptionsPressureModal
          stock={selectedOptionsStock}
          onClose={() => setSelectedOptionsStock(null)}
        />
      )}
    </main>
  );
}

function SummaryCard({ title, value, subtitle, positive }) {
  let valueColor = '#f8fafc';
  if (positive === true) valueColor = '#22c55e';
  if (positive === false) valueColor = '#ef4444';

  return (
    <article style={styles.summaryCard}>
      <p style={styles.summaryTitle}>{title}</p>
      <strong style={{ ...styles.summaryValue, color: valueColor }}>
        {value}
      </strong>
      <span style={styles.summarySubtitle}>{subtitle}</span>
    </article>
  );
}

function PortfolioSection({
  title,
  currency,
  stocks,
  prices,
  userId,
  onOpenOptions,
}) {
  const [processingId, setProcessingId] = useState('');

  async function editPosition(stock) {
    const currentQuantity = toNumber(
      stock.quantity ?? stock.lot ?? stock.amount
    );

    const currentCost = toNumber(
      stock.costPrice ?? stock.cost ?? stock.buyPrice
    );

    const quantityInput = window.prompt(
      `${stock.code} için yeni lot miktarını yazın:`,
      String(currentQuantity)
    );

    if (quantityInput === null) return;

    const newQuantity = toNumber(quantityInput);

    if (newQuantity < 0) {
      window.alert('Lot miktarı sıfırdan küçük olamaz.');
      return;
    }

    const costInput = window.prompt(
      `${stock.code} için yeni ortalama maliyeti yazın:`,
      String(currentCost).replace('.', ',')
    );

    if (costInput === null) return;

    const newCost = toNumber(costInput);

    if (newCost < 0) {
      window.alert('Maliyet sıfırdan küçük olamaz.');
      return;
    }

    setProcessingId(stock.id);

    try {
      const stockRef = doc(
        firestoreDb,
        'users',
        userId,
        'portfolio',
        stock.id
      );

      const updateData = {};

      if (
        Object.prototype.hasOwnProperty.call(
          stock,
          'quantity'
        )
      ) {
        updateData.quantity = newQuantity;
      } else if (
        Object.prototype.hasOwnProperty.call(
          stock,
          'amount'
        )
      ) {
        updateData.amount = newQuantity;
      } else {
        updateData.lot = newQuantity;
      }

      if (
        Object.prototype.hasOwnProperty.call(
          stock,
          'costPrice'
        )
      ) {
        updateData.costPrice = newCost;
      } else if (
        Object.prototype.hasOwnProperty.call(
          stock,
          'buyPrice'
        )
      ) {
        updateData.buyPrice = newCost;
      } else {
        updateData.cost = newCost;
      }

      await updateDoc(stockRef, updateData);
    } catch (error) {
      console.error('Pozisyon güncelleme hatası:', error);
      window.alert(
        `Pozisyon güncellenemedi: ${
          error?.message || 'Bilinmeyen hata'
        }`
      );
    } finally {
      setProcessingId('');
    }
  }

  async function sellPosition(stock) {
    const code = String(stock.code || '')
      .trim()
      .toUpperCase();

    const quantity = toNumber(
      stock.quantity ?? stock.lot ?? stock.amount
    );

    const buyPrice = toNumber(
      stock.costPrice ?? stock.cost ?? stock.buyPrice
    );

    if (quantity <= 0) {
      window.alert('Satılabilecek geçerli bir lot miktarı bulunamadı.');
      return;
    }

    const quantityInput = window.prompt(
      `${code} için satılan lot miktarını yazın. Mevcut: ${formatNumber(quantity)}`,
      String(quantity).replace('.', ',')
    );

    if (quantityInput === null) return;

    const soldQuantity = toNumber(quantityInput);

    if (soldQuantity <= 0) {
      window.alert('Satılan lot miktarı sıfırdan büyük olmalıdır.');
      return;
    }

    if (soldQuantity > quantity) {
      window.alert(
        `Satılan lot, mevcut ${formatNumber(quantity)} lottan fazla olamaz.`
      );
      return;
    }

    const liveData =
      prices[`${stock.market}:${code}`] || {};

    const suggestedSalePrice = toNumber(
      liveData.price ?? stock.currentPrice
    );

    const saleInput = window.prompt(
      `${code} için satış fiyatını yazın:`,
      suggestedSalePrice > 0
        ? String(suggestedSalePrice).replace('.', ',')
        : ''
    );

    if (saleInput === null) return;

    const sellPrice = toNumber(saleInput);

    if (sellPrice <= 0) {
      window.alert('Satış fiyatı sıfırdan büyük olmalıdır.');
      return;
    }

    const remainingQuantity = Math.max(
      0,
      quantity - soldQuantity
    );

    const actionText =
      remainingQuantity > 0
        ? `${formatNumber(soldQuantity)} lot satılacak ve ${formatNumber(remainingQuantity)} lot açık pozisyonda kalacak.`
        : `${formatNumber(quantity)} lotun tamamı satılacak ve pozisyon kapanacak.`;

    const confirmed = window.confirm(
      `${code}: ${actionText}

Onaylıyor musunuz?`
    );

    if (!confirmed) return;

    setProcessingId(stock.id);

    try {
      const stockRef = doc(
        firestoreDb,
        'users',
        userId,
        'portfolio',
        stock.id
      );

      const closedRef = doc(
        collection(
          firestoreDb,
          'users',
          userId,
          'closed'
        )
      );

      const batch = writeBatch(firestoreDb);

      batch.set(closedRef, {
        code,
        market: stock.market,
        quantity: soldQuantity,
        buyPrice,
        sellPrice,
        profitLoss:
          soldQuantity * (sellPrice - buyPrice),
        closedAt: new Date().toISOString(),
        partialSale: remainingQuantity > 0,
      });

      if (remainingQuantity > 0) {
        let quantityField = 'lot';

        if (
          Object.prototype.hasOwnProperty.call(
            stock,
            'quantity'
          )
        ) {
          quantityField = 'quantity';
        } else if (
          Object.prototype.hasOwnProperty.call(
            stock,
            'amount'
          )
        ) {
          quantityField = 'amount';
        }

        batch.update(stockRef, {
          [quantityField]: remainingQuantity,
        });
      } else {
        batch.delete(stockRef);
      }

      await batch.commit();
    } catch (error) {
      console.error('Pozisyon satış hatası:', error);
      window.alert(
        `Satış kaydedilemedi: ${
          error?.message || 'Bilinmeyen hata'
        }`
      );
    } finally {
      setProcessingId('');
    }
  }

  return (
    <section style={styles.portfolioSection}>
      <div style={styles.sectionHeader}>
        <h2 style={styles.sectionTitle}>{title}</h2>
        <span style={styles.stockCount}>{stocks.length} adet</span>
      </div>

      {stocks.length === 0 ? (
        <div style={styles.emptyBox}>Bu bölümde kayıtlı hisse yok.</div>
      ) : (
        <div style={styles.tableWrapper}>
          <div style={styles.tableHeader}>
            <div>Hisse</div>
            <div>Lot</div>
            <div>Maliyet</div>
            <div>Güncel fiyat</div>
            <div>Toplam K/Z</div>
            <div>Günlük K/Z</div>
            <div>İşlemler</div>
          </div>

          {stocks.map((stock) => {
            const code = String(stock.code || '').trim().toUpperCase();
            const liveData = prices[`${stock.market}:${code}`] || {};
            const quantity = toNumber(
              stock.quantity ?? stock.lot ?? stock.amount
            );
            const costPrice = toNumber(
              stock.costPrice ?? stock.cost ?? stock.buyPrice
            );
            const currentPrice = toNumber(
              liveData.price ?? stock.currentPrice
            );
            const previousClose = toNumber(liveData.previousClose);

            const hasPrice = currentPrice > 0;
            const hasDailyPrice = hasPrice && previousClose > 0;

            const totalCost = quantity * costPrice;
            const currentValue = quantity * currentPrice;
            const profitLoss = hasPrice ? currentValue - totalCost : 0;
            const profitLossPercent =
              hasPrice && totalCost > 0
                ? (profitLoss / totalCost) * 100
                : 0;

            const dailyProfitLoss = hasDailyPrice
              ? quantity * (currentPrice - previousClose)
              : 0;

            const previousValue = quantity * previousClose;
            const dailyPercent =
              hasDailyPrice && previousValue > 0
                ? (dailyProfitLoss / previousValue) * 100
                : 0;

            const isProcessing = processingId === stock.id;

            return (
              <div key={stock.id} style={styles.stockRow}>
                <div>
                  {stock.market === 'bist' ? (
                    <strong style={styles.rowStockCode}>
                      {code || 'KOD YOK'}
                    </strong>
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        onOpenOptions({
                          ...stock,
                          code,
                          currentPrice,
                        })
                      }
                      style={styles.rowStockButton}
                      title={`${code} opsiyon ve short analizini aç`}
                    >
                      {code || 'KOD YOK'}
                    </button>
                  )}
                  <span style={styles.rowMarket}>
                    {stock.market === 'bist' ? 'BIST' : 'NASDAQ'}
                  </span>
                </div>

                <div style={styles.rowCell}>{formatNumber(quantity)}</div>
                <div style={styles.rowCell}>
                  {formatMoney(costPrice, currency)}
                </div>
                <div style={styles.rowCell}>
                  {hasPrice
                    ? formatMoney(currentPrice, currency)
                    : 'Bekleniyor'}
                </div>

                <ProfitCell
                  hasValue={hasPrice}
                  value={profitLoss}
                  percent={profitLossPercent}
                  currency={currency}
                />

                <ProfitCell
                  hasValue={hasDailyPrice}
                  value={dailyProfitLoss}
                  percent={dailyPercent}
                  currency={currency}
                />

                <div style={styles.actionCell}>
                  <button
                    type="button"
                    onClick={() => editPosition(stock)}
                    disabled={isProcessing}
                    style={{
                      ...styles.editButton,
                      opacity: isProcessing ? 0.55 : 1,
                    }}
                  >
                    {isProcessing ? 'Bekleyin…' : 'Düzenle'}
                  </button>

                  <button
                    type="button"
                    onClick={() => sellPosition(stock)}
                    disabled={isProcessing}
                    style={{
                      ...styles.sellButton,
                      opacity: isProcessing ? 0.55 : 1,
                    }}
                  >
                    Sat
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}


function NewsPanel({ stocks }) {
  const [news, setNews] = useState([]);
  const [newsStatus, setNewsStatus] = useState('NASDAQ haberleri yükleniyor…');

  const nasdaqSymbols = useMemo(
    () =>
      Array.from(
        new Set(
          stocks
            .filter((stock) => stock.market !== 'bist')
            .map((stock) => String(stock.code || '').trim().toUpperCase())
            .filter(Boolean)
        )
      ).slice(0, 8),
    [stocks]
  );

  useEffect(() => {
    const controller = new AbortController();

    async function loadNews() {
      try {
        setNewsStatus('NASDAQ haberleri yükleniyor…');

        const query = new URLSearchParams({
          symbols: nasdaqSymbols.join(','),
        });

        const response = await fetch(`/api/news?${query.toString()}`, {
          cache: 'no-store',
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error('Haber servisi yanıt vermedi.');
        }

        const payload = await response.json();
        const items = Array.isArray(payload.items) ? payload.items : [];

        setNews(items);
        setNewsStatus(
          items.length
            ? ''
            : 'Son 48 saatte uygun NASDAQ haberi bulunamadı.'
        );
      } catch (error) {
        if (error.name !== 'AbortError') {
          setNews([]);
          setNewsStatus(
            'Güncel NASDAQ haberleri alınamadı. Biraz sonra tekrar deneyin.'
          );
        }
      }
    }

    loadNews();
    const timer = setInterval(loadNews, 5 * 60 * 1000);

    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [nasdaqSymbols]);

  return (
    <article style={styles.panelCard}>
      <div style={styles.panelHeader}>
        <h3 style={styles.panelTitle}>NASDAQ Haberleri</h3>
        <span style={styles.panelBadge}>Canlı</span>
      </div>

      <p style={styles.panelDescription}>
        Önce portföyündeki NASDAQ hisseleri, ardından önemli genel NASDAQ ve ABD piyasa haberleri gösterilir.
      </p>

      <div style={styles.panelList}>
        {newsStatus ? <div style={styles.panelEmpty}>{newsStatus}</div> : null}

        {news.slice(0, 6).map((item) => (
          <a
            key={`${item.link}-${item.publishedAt}`}
            href={item.link}
            target="_blank"
            rel="noreferrer"
            style={styles.newsRow}
          >
            <div style={{ minWidth: 0 }}>
              <strong style={styles.listPrimary}>{item.title}</strong>
              <span style={styles.listSecondary}>
                {item.source || 'Finans Haberi'} · {item.timeLabel || 'Yeni'}
              </span>
            </div>
            <span style={styles.marketChip}>
              {item.category || 'NASDAQ'}
            </span>
          </a>
        ))}
      </div>
    </article>
  );
}

function getUsExtendedSession() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date())
      .filter(
        (part) => part.type !== 'literal'
      )
      .map(
        (part) => [part.type, part.value]
      )
  );

  if (
    ['Sat', 'Sun'].includes(parts.weekday)
  ) {
    return 'closed';
  }

  const minutes =
    Number(parts.hour) * 60 +
    Number(parts.minute);

  if (
    minutes >= 4 * 60 &&
    minutes < 9 * 60 + 30
  ) {
    return 'pre';
  }

  if (
    minutes >= 9 * 60 + 30 &&
    minutes < 16 * 60
  ) {
    return 'regular';
  }

  if (
    minutes >= 16 * 60 &&
    minutes < 20 * 60
  ) {
    return 'after';
  }

  return 'closed';
}

function WatchlistPanel({
  items,
  prices,
  userId,
}) {
  const [processing, setProcessing] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [watchlistOpen, setWatchlistOpen] = useState(true);
  const [priceAlerts, setPriceAlerts] = useState([]);
  const [savedGroups, setSavedGroups] = useState([]);
  const [activeListId, setActiveListId] = useState('default');

  useEffect(() => {
    if (!userId) return undefined;

    return onSnapshot(
      collection(
        firestoreDb,
        'users',
        userId,
        'priceAlerts'
      ),
      (snapshot) => {
        setPriceAlerts(
          snapshot.docs.map((alertDoc) => ({
            id: alertDoc.id,
            ...alertDoc.data(),
          }))
        );
      },
      (error) => {
        console.error(
          'Fiyat alarmları okunamadı:',
          error
        );
      }
    );
  }, [userId]);

  useEffect(() => {
    if (!userId) return undefined;

    return onSnapshot(
      collection(
        firestoreDb,
        'users',
        userId,
        'watchlistGroups'
      ),
      (snapshot) => {
        const next = snapshot.docs
          .map((groupDoc) => ({
            id: groupDoc.id,
            ...groupDoc.data(),
          }))
          .sort((first, second) => {
            const firstOrder = Number(first.order);
            const secondOrder = Number(second.order);

            if (
              Number.isFinite(firstOrder) &&
              Number.isFinite(secondOrder) &&
              firstOrder !== secondOrder
            ) {
              return firstOrder - secondOrder;
            }

            return String(first.name || '').localeCompare(
              String(second.name || ''),
              'tr'
            );
          });

        setSavedGroups(next);
      },
      (error) => {
        console.error(
          'Takip listesi grupları okunamadı:',
          error
        );
      }
    );
  }, [userId]);

  const groups = useMemo(() => {
    const savedDefault = savedGroups.find(
      (group) => group.id === 'default'
    );

    return [
      {
        id: 'default',
        name: String(savedDefault?.name || 'Ana Liste'),
        order: -1,
      },
      ...savedGroups.filter((group) => group.id !== 'default'),
    ];
  }, [savedGroups]);

  useEffect(() => {
    if (!groups.some((group) => group.id === activeListId)) {
      setActiveListId('default');
    }
  }, [groups, activeListId]);

  const activeItems = useMemo(
    () =>
      items.filter(
        (item) =>
          String(item.listId || 'default') === activeListId
      ),
    [items, activeListId]
  );

  const activeGroup =
    groups.find((group) => group.id === activeListId) || groups[0];

  async function configurePriceAlert(item) {
    const code = String(item.code || '')
      .trim()
      .toUpperCase();

    if (!code) return;

    const market =
      item.market === 'bist'
        ? 'BIST'
        : 'NASDAQ';

    const alertId =
      `${item.market}_${code}`
        .replace(/[^a-zA-Z0-9_-]/g, '_');

    const choice = window.prompt(
      [
        `${code} için alarm türünü seçin:`,
        '',
        '1 = Fiyat bunun ÜSTÜNE çıkınca',
        '2 = Fiyat bunun ALTINA düşünce',
        '3 = Günlük yükseliş yüzdesi',
        '4 = Günlük düşüş yüzdesi',
        '5 = Fiyat buna EŞİT olunca / hedefe ulaşınca',
        '6 = Bu hissedeki TÜM alarmları sil',
      ].join('\n'),
      '1'
    );

    if (choice === null) return;

    if (String(choice).trim() === '6') {
      const confirmed = window.confirm(
        `${code} için kurulan tüm alarmlar silinsin mi?`
      );

      if (!confirmed) return;

      try {
        await deleteDoc(
          doc(
            firestoreDb,
            'users',
            userId,
            'priceAlerts',
            alertId
          )
        );

        window.alert(
          `${code} alarmları silindi.`
        );
      } catch (error) {
        window.alert(
          `Alarm silinemedi: ${
            error?.message || 'Bilinmeyen hata'
          }`
        );
      }

      return;
    }

    const rules = {
      '1': {
        field: 'priceAbove',
        label: 'üst fiyat',
      },
      '2': {
        field: 'priceBelow',
        label: 'alt fiyat',
      },
      '3': {
        field: 'percentUp',
        label: 'yükseliş yüzdesi',
      },
      '4': {
        field: 'percentDown',
        label: 'düşüş yüzdesi',
      },
      '5': {
        field: 'priceReached',
        label: 'hedef fiyat',
      },
    };

    const rule =
      rules[String(choice).trim()];

    if (!rule) {
      window.alert(
        '1, 2, 3, 4, 5 veya 6 yazmalısınız.'
      );
      return;
    }

    const defaultValue =
      rule.field === 'percentUp'
        ? '5'
        : rule.field === 'percentDown'
          ? '7'
          : '';

    const targetInput = window.prompt(
      `${code} için ${rule.label} değerini yazın:`,
      defaultValue
    );

    if (targetInput === null) return;

    const target = toNumber(targetInput);

    if (target <= 0) {
      window.alert(
        'Alarm değeri sıfırdan büyük olmalıdır.'
      );
      return;
    }

    const currentPrice = toNumber(
      prices[
        `${item.market}:${code}`
      ]?.price
    );

    /*
      Hedef mevcut fiyatın üzerindeyse yukarı,
      altındaysa aşağı yönlü alarm kurulur.
      Böylece fiyat hedefi atlayarak geçse bile
      bildirim kaçırılmaz.
    */
    const savedField =
      rule.field === 'priceReached'
        ? currentPrice > 0 &&
          target < currentPrice
          ? 'priceBelow'
          : 'priceAbove'
        : rule.field;

    setProcessing(true);

    try {
      await setDoc(
        doc(
          firestoreDb,
          'users',
          userId,
          'priceAlerts',
          alertId
        ),
        {
          symbol: code,
          market,
          enabled: true,
          [savedField]: target,
          updatedAt:
            new Date().toISOString(),
        },
        { merge: true }
      );

      window.alert(
        `${code} ${rule.label} alarmı kuruldu.`
      );
    } catch (error) {
      console.error(
        'Fiyat alarmı kaydetme hatası:',
        error
      );

      window.alert(
        `Alarm kurulamadı: ${
          error?.message || 'Bilinmeyen hata'
        }`
      );
    } finally {
      setProcessing(false);
    }
  }

  async function createWatchlist() {
    const input = window.prompt(
      'Yeni takip listesinin adını yazın:',
      'Fonlarım'
    );

    if (input === null) return;

    const name = String(input).trim().replace(/\s+/g, ' ');

    if (name.length < 2 || name.length > 40) {
      window.alert('Liste adı 2 ile 40 karakter arasında olmalıdır.');
      return;
    }

    if (
      groups.some(
        (group) =>
          String(group.name || '').toLocaleLowerCase('tr-TR') ===
          name.toLocaleLowerCase('tr-TR')
      )
    ) {
      window.alert('Bu isimde bir takip listesi zaten var.');
      return;
    }

    setProcessing(true);

    try {
      const groupRef = await addDoc(
        collection(
          firestoreDb,
          'users',
          userId,
          'watchlistGroups'
        ),
        {
          name,
          order: groups.length,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
      );

      setActiveListId(groupRef.id);
      setWatchlistOpen(true);
    } catch (error) {
      console.error('Takip listesi oluşturma hatası:', error);
      window.alert(
        `Liste oluşturulamadı: ${
          error?.message || 'Bilinmeyen hata'
        }`
      );
    } finally {
      setProcessing(false);
    }
  }

  async function renameWatchlist() {
    const input = window.prompt(
      'Takip listesinin yeni adını yazın:',
      activeGroup?.name || 'Ana Liste'
    );

    if (input === null) return;

    const name = String(input).trim().replace(/\s+/g, ' ');

    if (name.length < 2 || name.length > 40) {
      window.alert('Liste adı 2 ile 40 karakter arasında olmalıdır.');
      return;
    }

    if (
      groups.some(
        (group) =>
          group.id !== activeListId &&
          String(group.name || '').toLocaleLowerCase('tr-TR') ===
            name.toLocaleLowerCase('tr-TR')
      )
    ) {
      window.alert('Bu isimde başka bir takip listesi var.');
      return;
    }

    setProcessing(true);

    try {
      await setDoc(
        doc(
          firestoreDb,
          'users',
          userId,
          'watchlistGroups',
          activeListId
        ),
        {
          name,
          order: activeGroup?.order ?? groups.length,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    } catch (error) {
      console.error('Takip listesi adlandırma hatası:', error);
      window.alert(
        `Liste adı değiştirilemedi: ${
          error?.message || 'Bilinmeyen hata'
        }`
      );
    } finally {
      setProcessing(false);
    }
  }

  async function deleteWatchlist() {
    if (activeListId === 'default') {
      window.alert('Ana liste silinemez; ismini değiştirebilirsiniz.');
      return;
    }

    if (activeItems.length > 0) {
      window.alert(
        'Bu listede varlıklar var. Listeyi silmeden önce içindeki varlıkları kaldırın.'
      );
      return;
    }

    const confirmed = window.confirm(
      `“${activeGroup?.name || 'Takip listesi'}” silinsin mi?`
    );

    if (!confirmed) return;

    setProcessing(true);

    try {
      await deleteDoc(
        doc(
          firestoreDb,
          'users',
          userId,
          'watchlistGroups',
          activeListId
        )
      );

      setActiveListId('default');
    } catch (error) {
      console.error('Takip listesi silme hatası:', error);
      window.alert(
        `Liste silinemedi: ${
          error?.message || 'Bilinmeyen hata'
        }`
      );
    } finally {
      setProcessing(false);
    }
  }

  async function addWatchItem() {
    const codeInput = window.prompt(
      `${activeGroup?.name || 'Takip listesi'} listesine eklenecek hisse, ETF veya fon kodunu yazın:`,
      'BE'
    );

    if (codeInput === null) return;

    const code = String(codeInput).trim().toUpperCase();

    if (!code) {
      window.alert('Hisse kodu boş bırakılamaz.');
      return;
    }

    const marketInput = window.prompt(
      [
        'Varlık türünü seçin:',
        '',
        '1 = BIST hissesi',
        '2 = ABD hissesi',
        '3 = ABD ETF/FON',
      ].join('\n'),
      '2'
    );

    if (marketInput === null) return;

    const normalizedMarket = String(marketInput)
      .trim()
      .toUpperCase();

    const market =
      normalizedMarket === '1' ||
      normalizedMarket === 'BIST' ? 'bist' :
      normalizedMarket === '2' ||
      normalizedMarket === '3' ||
      normalizedMarket === 'NASDAQ' ||
      normalizedMarket === 'NYSE' ||
      normalizedMarket === 'AMEX' ||
      normalizedMarket === 'ABD' ||
      normalizedMarket === 'US' ||
      normalizedMarket === 'ETF' ||
      normalizedMarket === 'FON' ? 'us' : '';

    if (!market) {
      window.alert('Varlık türü olarak 1, 2 veya 3 yazmalısınız.');
      return;
    }

    const assetType =
      market === 'bist'
        ? 'stock'
        : ['3', 'ETF', 'FON'].includes(normalizedMarket)
          ? 'fund'
          : 'stock-or-fund';

    const alreadyExists = activeItems.some(
      (item) =>
        String(item.code || '').trim().toUpperCase() === code &&
        item.market === market
    );

    if (alreadyExists) {
      window.alert(`${code} zaten takip listesinde.`);
      return;
    }

    setProcessing(true);

    try {
      await addDoc(
        collection(
          firestoreDb,
          'users',
          userId,
          'watchlist'
        ),
        {
          code,
          market,
          assetType,
          listId: activeListId,
          order:
            activeItems.length > 0
              ? Math.max(
                  ...activeItems.map((item, index) => {
                    const savedOrder = Number(item.order);
                    return Number.isFinite(savedOrder)
                      ? savedOrder
                      : index;
                  })
                ) + 1
              : 0,
          createdAt: new Date().toISOString(),
        }
      );
    } catch (error) {
      console.error('Takip listesine ekleme hatası:', error);
      window.alert(
        `Hisse eklenemedi: ${error?.message || 'Bilinmeyen hata'}`
      );
    } finally {
      setProcessing(false);
    }
  }

  async function saveWatchlistOrder(fromIndex, toIndex) {
    if (
      processing ||
      !Number.isInteger(fromIndex) ||
      !Number.isInteger(toIndex) ||
      fromIndex === toIndex ||
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= activeItems.length ||
      toIndex >= activeItems.length
    ) {
      return;
    }

    const reorderedItems = [...activeItems];
    const [movedItem] = reorderedItems.splice(fromIndex, 1);
    reorderedItems.splice(toIndex, 0, movedItem);

    setProcessing(true);

    try {
      await Promise.all(
        reorderedItems.map((item, order) =>
          updateDoc(
            doc(
              firestoreDb,
              'users',
              userId,
              'watchlist',
              item.id
            ),
            {
              order,
              updatedAt: new Date().toISOString(),
            }
          )
        )
      );
    } catch (error) {
      console.error('Takip listesi sıralama hatası:', error);
      window.alert(
        `Sıralama kaydedilemedi: ${
          error?.message || 'Bilinmeyen hata'
        }`
      );
    } finally {
      setProcessing(false);
    }
  }

  async function removeWatchItem(item) {
    const code = String(item.code || '').trim().toUpperCase();

    const confirmed = window.confirm(
      `${code} takip listesinden çıkarılsın mı?`
    );

    if (!confirmed) return;

    setProcessing(true);

    try {
      await deleteDoc(
        doc(
          firestoreDb,
          'users',
          userId,
          'watchlist',
          item.id
        )
      );
    } catch (error) {
      console.error('Takip listesinden çıkarma hatası:', error);
      window.alert(
        `Hisse çıkarılamadı: ${error?.message || 'Bilinmeyen hata'}`
      );
    } finally {
      setProcessing(false);
    }
  }

  return (
    <article style={styles.panelCard} className="sky-watch-card">
      <style jsx global>{`
        .sky-watch-header,
        .sky-watch-row {
          grid-template-columns:
            minmax(92px, 1.15fr)
            minmax(105px, 1fr)
            minmax(72px, 0.75fr)
            66px !important;
          gap: 9px !important;
          align-items: center !important;
        }

        .sky-watch-row {
          padding: 10px 0 !important;
        }

        .sky-watch-actions {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 5px;
        }

        .sky-alert-icon,
        .sky-remove-button {
          width: 29px !important;
          min-width: 29px !important;
          height: 29px !important;
          min-height: 29px !important;
          padding: 0 !important;
          border-radius: 7px !important;
          line-height: 1 !important;
        }

        @media (max-width: 600px) {
          .sky-watch-card {
            padding: 13px !important;
            overflow: hidden;
          }

          .sky-watch-header,
          .sky-watch-row {
            grid-template-columns:
              minmax(72px, 1fr)
              minmax(90px, 1fr)
              minmax(60px, 0.75fr)
              61px !important;
            gap: 6px !important;
          }

          .sky-watch-row {
            padding: 9px 0 !important;
          }

          .sky-alert-icon,
          .sky-remove-button {
            width: 27px !important;
            min-width: 27px !important;
            height: 27px !important;
            min-height: 27px !important;
          }
        }













        /* SKY-WATCHLIST-TWO-PANE-START */
        .sky-watch-card {
          width: 100% !important;
          max-width: none !important;
          min-height: 0 !important;
          margin: 0 !important;
          padding: 11px !important;
          overflow-x: auto !important;
          box-sizing: border-box !important;
        }

        .sky-watch-header {
          display: grid !important;
          grid-template-columns:
            minmax(78px, 1.15fr)
            minmax(105px, 1fr)
            64px
            64px
            66px
            55px
            minmax(78px, 1.15fr)
            minmax(105px, 1fr)
            64px
            64px
            66px
            55px !important;
          align-items: center !important;
          gap: 6px !important;
          min-width: 1050px !important;
          padding: 5px 6px !important;
          border-bottom:
            1px solid rgba(148,163,184,0.24) !important;
          color: #94a3b8 !important;
          font-size: 9px !important;
          font-weight: 900 !important;
        }

        .sky-watch-grid {
          display: grid !important;
          grid-template-columns:
            repeat(2, minmax(0, 1fr)) !important;
          grid-template-rows:
            repeat(
              var(--sky-watch-rows),
              minmax(31px, auto)
            ) !important;
          grid-auto-flow: column !important;
          column-gap: 24px !important;
          row-gap: 0 !important;
          min-width: 1050px !important;
          padding: 0 !important;
        }

        .sky-watch-row {
          display: grid !important;
          grid-template-columns:
            minmax(78px, 1.15fr)
            minmax(105px, 1fr)
            64px
            64px
            66px
            55px !important;
          grid-template-rows: 1fr !important;
          align-items: center !important;
          gap: 6px !important;
          min-width: 0 !important;
          min-height: 31px !important;
          padding: 3px 6px !important;
          border: 0 !important;
          border-bottom:
            1px solid rgba(212,175,55,0.10) !important;
          border-radius: 0 !important;
          background: transparent !important;
          box-sizing: border-box !important;
        }

        .sky-watch-row:hover {
          background:
            rgba(56,189,248,0.055) !important;
        }

        .sky-watch-row > :nth-child(1) {
          grid-column: 1 !important;
          grid-row: 1 !important;
        }

        .sky-watch-row > :nth-child(2) {
          grid-column: 2 !important;
          grid-row: 1 !important;
        }

        .sky-watch-row > :nth-child(3) {
          grid-column: 3 !important;
          grid-row: 1 !important;
        }

        .sky-watch-row > :nth-child(4) {
          grid-column: 4 !important;
          grid-row: 1 !important;
        }

        .sky-watch-row > :nth-child(5) {
          grid-column: 5 !important;
          grid-row: 1 !important;
          text-align: left !important;
        }

        .sky-watch-row > :nth-child(6) {
          grid-column: 6 !important;
          grid-row: 1 !important;
          display: flex !important;
          align-items: center !important;
          justify-content: flex-start !important;
          gap: 3px !important;
        }

        .sky-watch-row > :nth-child(1) > span {
          display: none !important;
        }

        .sky-watch-row strong {
          overflow: hidden !important;
          font-size: 12px !important;
          line-height: 1 !important;
          text-overflow: ellipsis !important;
          white-space: nowrap !important;
        }

        .sky-watch-row span {
          font-size: 10px !important;
          line-height: 1 !important;
          white-space: nowrap !important;
        }

        .sky-watch-row button,
        .sky-watch-row .sky-alert-icon,
        .sky-watch-row .sky-remove-button {
          width: 22px !important;
          min-width: 22px !important;
          height: 21px !important;
          min-height: 21px !important;
          padding: 0 !important;
          border-radius: 4px !important;
          font-size: 9px !important;
        }

        @media (max-width: 1050px) {
          .sky-watch-header {
            grid-template-columns:
              minmax(85px, 1fr)
              minmax(115px, 1fr)
              68px
              68px
              72px
              58px !important;
            min-width: 520px !important;
          }

          .sky-watch-header-copy {
            display: none !important;
          }

          .sky-watch-grid {
            display: block !important;
            min-width: 520px !important;
          }

          .sky-watch-row {
            grid-template-columns:
              minmax(85px, 1fr)
              minmax(115px, 1fr)
              68px
              68px
              72px
              58px !important;
          }
        }
        /* SKY-WATCHLIST-TWO-PANE-END */

      `}</style>

      <div style={styles.panelHeader}>
        <button
          type="button"
          onClick={() =>
            setWatchlistOpen(
              (current) => !current
            )
          }
          aria-expanded={watchlistOpen}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: 0,
            border: 0,
            background: 'transparent',
            color: '#f8fafc',
            cursor: 'pointer',
            fontFamily: 'inherit',
            textAlign: 'left',
          }}
        >
          <h3 style={styles.panelTitle}>
            Takip Listeleri
          </h3>

          <span
            style={{
              color: '#f0d675',
              fontSize: '13px',
              transition:
                'transform 180ms ease',
              transform: watchlistOpen
                ? 'rotate(180deg)'
                : 'rotate(0deg)',
            }}
          >
            ▼
          </span>
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={styles.panelBadge}>{activeItems.length} varlık</span>

          <button
            type="button"
            onClick={addWatchItem}
            disabled={processing}
            style={{
              border: '1px solid rgba(212,175,55,0.42)',
              borderRadius: 8,
              padding: '6px 10px',
              background: '#151109',
              color: '#f8fafc',
              cursor: processing ? 'default' : 'pointer',
              opacity: processing ? 0.55 : 1,
              fontWeight: 700,
            }}
          >
            + Varlık Ekle
          </button>
        </div>
      </div>

      <div
        style={{
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '9px',
          marginBottom: '9px',
          overflowX: 'auto',
          display: watchlistOpen ? 'flex' : 'none',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            minWidth: 0,
          }}
        >
          {groups.map((group) => {
            const selected = group.id === activeListId;
            const count = items.filter(
              (item) =>
                String(item.listId || 'default') === group.id
            ).length;

            return (
              <button
                key={group.id}
                type="button"
                onClick={() => setActiveListId(group.id)}
                disabled={processing}
                aria-pressed={selected}
                style={{
                  minHeight: '31px',
                  padding: '0 10px',
                  flex: '0 0 auto',
                  border: selected
                    ? '1px solid rgba(212,175,55,0.65)'
                    : '1px solid rgba(148,163,184,0.18)',
                  borderRadius: '8px',
                  background: selected
                    ? 'rgba(212,175,55,0.16)'
                    : 'rgba(255,255,255,0.025)',
                  color: selected ? '#f0d675' : '#94a3b8',
                  fontFamily: 'inherit',
                  fontSize: '11px',
                  fontWeight: 850,
                  whiteSpace: 'nowrap',
                  cursor: processing ? 'default' : 'pointer',
                }}
              >
                {group.name} · {count}
              </button>
            );
          })}
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            flex: '0 0 auto',
          }}
        >
          <button
            type="button"
            onClick={createWatchlist}
            disabled={processing}
            title="Yeni takip listesi oluştur"
            style={styles.watchlistManageButton}
          >
            + Liste
          </button>
          <button
            type="button"
            onClick={renameWatchlist}
            disabled={processing}
            title="Seçili listenin adını değiştir"
            style={styles.watchlistManageButton}
          >
            ✎ Adlandır
          </button>
          {activeListId !== 'default' ? (
            <button
              type="button"
              onClick={deleteWatchlist}
              disabled={processing}
              title="Boş takip listesini sil"
              style={{
                ...styles.watchlistManageButton,
                color: '#fca5a5',
                borderColor: 'rgba(248,113,113,0.30)',
              }}
            >
              Sil
            </button>
          ) : null}
        </div>
      </div>

      <div
        className="sky-watch-header"
        style={{
          ...styles.miniTableHeader,
          display: watchlistOpen
            ? 'grid'
            : 'none',
        }}
      >
        <span>Varlık Kodu</span>
        <span>Son / PRE-AFTER</span>
        <span>Düşük</span>
        <span>Yüksek</span>
        <span>% Değişim</span>
        <span>İşlem</span>

        <span className="sky-watch-header-copy">
          Varlık Kodu
        </span>
        <span className="sky-watch-header-copy">
          Son / PRE-AFTER
        </span>
        <span className="sky-watch-header-copy">
          Düşük
        </span>
        <span className="sky-watch-header-copy">
          Yüksek
        </span>
        <span className="sky-watch-header-copy">
          % Değişim
        </span>
        <span className="sky-watch-header-copy">
          İşlem
        </span>
      </div>

      <div
        className="sky-watch-grid"
        style={{
          ...styles.panelList,
          '--sky-watch-rows': String(
            Math.max(
              1,
              Math.ceil(activeItems.length / 2)
            )
          ),
          display: watchlistOpen
            ? 'block'
            : 'none',
        }}
      >
        {activeItems.length === 0 ? (
          <div style={styles.panelEmpty}>
            “{activeGroup?.name || 'Takip listesi'}” boş. “+ Varlık Ekle” ile hisse veya fon ekleyebilirsiniz.
          </div>
        ) : (
          activeItems.map((item, index) => {
            const code = String(item.code || '').trim().toUpperCase();
            const data = prices[`${item.market}:${code}`] || {};
            const price = toNumber(data.price);
            const previousClose = toNumber(data.previousClose);
            const preMarketPrice =
              toNumber(data.preMarketPrice);
            const preMarketChange =
              Number(
                data.preMarketChangePercent
              );
            const afterMarketPrice =
              toNumber(data.afterMarketPrice);
            const afterMarketChange =
              Number(
                data.afterMarketChangePercent
              );

            const usSession =
              item.market === 'us'
                ? getUsExtendedSession()
                : 'regular';

            const extendedLabel =
              usSession === 'pre'
                ? 'PRE'
                : usSession === 'after'
                  ? 'AFTER'
                  : '';

            const extendedPrice =
              usSession === 'pre'
                ? preMarketPrice
                : usSession === 'after'
                  ? afterMarketPrice
                  : 0;

            const extendedChange =
              usSession === 'pre'
                ? preMarketChange
                : usSession === 'after'
                  ? afterMarketChange
                  : null;

            const change =
              price > 0 && previousClose > 0
                ? ((price - previousClose) / previousClose) * 100
                : 0;

            const currency = item.market === 'bist' ? 'TRY' : 'USD';

            const alertId =
              `${item.market}_${code}`
                .replace(
                  /[^a-zA-Z0-9_-]/g,
                  '_'
                );

            const activeAlert =
              priceAlerts.find(
                (alert) =>
                  alert.id === alertId &&
                  alert.enabled !== false
              );

            return (
              <div
                key={item.id}
                draggable={!processing}
                onDragStart={(event) => {
                  setDraggedIndex(index);
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData(
                    'text/plain',
                    String(index)
                  );
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'move';
                }}
                onDrop={(event) => {
                  event.preventDefault();

                  const fromIndex = Number(
                    event.dataTransfer.getData('text/plain')
                  );

                  setDraggedIndex(null);
                  saveWatchlistOrder(fromIndex, index);
                }}
                onDragEnd={() => setDraggedIndex(null)}
                className="sky-watch-row"
                style={{
                  ...styles.watchRow,
                  opacity: draggedIndex === index ? 0.45 : 1,
                }}
              >
                <div>
                  <strong
                    style={{
                      ...styles.listPrimary,
                      color: '#f8fafc',
                    }}
                  >
                    ☆ {code}
                  </strong>

                  <span style={styles.listSecondary}>
                    {item.market === 'bist'
                      ? 'BIST'
                      : item.assetType === 'fund'
                        ? `${data.exchange || 'ABD'} ETF/FON`
                        : data.exchange || 'ABD'}
                  </span>
                </div>

                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    gap: '4px',
                    minWidth: 0,
                  }}
                >
                  <span style={styles.watchPrice}>
                    {price > 0
                      ? formatMoney(
                          price,
                          currency
                        )
                      : '—'}
                  </span>

                  {item.market === 'us' &&
                  extendedLabel &&
                  extendedPrice > 0 ? (
                    <span
                      title="Yakın zamanlı uzatılmış seans verisi"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        maxWidth: '100%',
                        padding: '3px 5px',
                        borderRadius: '6px',
                        color:
                          Number.isFinite(
                            extendedChange
                          ) &&
                          extendedChange < 0
                            ? '#fca5a5'
                            : '#86efac',
                        background:
                          extendedLabel === 'PRE'
                            ? 'rgba(56,189,248,0.10)'
                            : 'rgba(168,85,247,0.10)',
                        border:
                          extendedLabel === 'PRE'
                            ? '1px solid rgba(56,189,248,0.20)'
                            : '1px solid rgba(168,85,247,0.20)',
                        fontSize: '8px',
                        fontWeight: 850,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <b
                        style={{
                          color:
                            extendedLabel === 'PRE'
                              ? '#7dd3fc'
                              : '#d8b4fe',
                        }}
                      >
                        {extendedLabel}
                      </b>

                      {formatMoney(
                        extendedPrice,
                        currency
                      )}

                      {Number.isFinite(
                        extendedChange
                      )
                        ? formatPercent(
                            extendedChange
                          )
                        : ''}
                    </span>
                  ) : null}
                </div>

                <span
                  className="sky-watch-low-value"
                  style={styles.watchPrice}
                >
                  {toNumber(data.dayLow) > 0
                    ? formatMoney(
                        toNumber(data.dayLow),
                        currency
                      )
                    : '—'}
                </span>

                <span
                  className="sky-watch-high-value"
                  style={styles.watchPrice}
                >
                  {toNumber(data.dayHigh) > 0
                    ? formatMoney(
                        toNumber(data.dayHigh),
                        currency
                      )
                    : '—'}
                </span>

                <strong
                  style={{
                    color: change >= 0 ? '#22c55e' : '#ef4444',
                  }}
                >
                  {previousClose > 0 ? formatPercent(change) : '—'}
                </strong>

                <div className="sky-watch-actions">
                  <button
                    className="sky-alert-icon"
                    type="button"
                    onPointerDown={(event) =>
                      event.stopPropagation()
                    }
                    onClick={(event) => {
                      event.stopPropagation();
                      configurePriceAlert(item);
                    }}
                    disabled={processing}
                    title={
                      activeAlert
                        ? `${code} alarmını düzenle veya sil`
                        : `${code} için alarm kur`
                    }
                    aria-label={`${code} fiyat alarmı`}
                    style={{
                      border: activeAlert
                        ? '1px solid rgba(74,222,128,0.55)'
                        : '1px solid rgba(212,175,55,0.42)',
                      background: activeAlert
                        ? 'rgba(34,197,94,0.14)'
                        : 'rgba(212,175,55,0.10)',
                      color: activeAlert
                        ? '#86efac'
                        : '#f0d675',
                      cursor: processing
                        ? 'default'
                        : 'pointer',
                      opacity: processing ? 0.5 : 1,
                      fontSize: '13px',
                    }}
                  >
                    🔔
                  </button>

                  <button
                    className="sky-remove-button"
                    type="button"
                    onPointerDown={(event) =>
                      event.stopPropagation()
                    }
                    onClick={(event) => {
                      event.stopPropagation();
                      removeWatchItem(item);
                    }}
                    disabled={processing}
                    title={`${code} takip listesinden çıkar`}
                    aria-label={`${code} takip listesinden çıkar`}
                    style={{
                      border:
                        '1px solid rgba(239,68,68,0.45)',
                      background:
                        'rgba(127,29,29,0.35)',
                      color: '#fca5a5',
                      cursor: processing
                        ? 'default'
                        : 'pointer',
                      opacity: processing ? 0.45 : 1,
                      fontSize: '16px',
                      fontWeight: 900,
                    }}
                  >
                    ×
                  </button>
                </div>


              </div>
            );
          })
        )}
      </div>
    </article>
  );
}

function ClosedPositionsPanel({
  positions,
  userId,
  title = 'Kapanan Pozisyonlar',
}) {
  const [processing, setProcessing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  async function addClosedPosition() {
    const codeInput = window.prompt('Hisse kodunu yazın:');
    if (codeInput === null) return;

    const code = String(codeInput).trim().toUpperCase();

    if (!code) {
      window.alert('Hisse kodu boş bırakılamaz.');
      return;
    }

    const marketInput = window.prompt(
      'Piyasa yazın: BIST veya NASDAQ',
      'BIST'
    );

    if (marketInput === null) return;

    const normalizedMarket = String(marketInput)
      .trim()
      .toUpperCase();

    const market =
      normalizedMarket === 'BIST' ? 'bist' :
      normalizedMarket === 'NASDAQ' ||
      normalizedMarket === 'ABD' ||
      normalizedMarket === 'US' ? 'us' : '';

    if (!market) {
      window.alert('Piyasa olarak BIST veya NASDAQ yazmalısınız.');
      return;
    }

    const quantityInput = window.prompt('Satılan lot/adet miktarını yazın:');
    if (quantityInput === null) return;

    const quantity = toNumber(quantityInput);

    if (quantity <= 0) {
      window.alert('Lot/adet sıfırdan büyük olmalıdır.');
      return;
    }

    const buyInput = window.prompt('Ortalama alış fiyatını yazın:');
    if (buyInput === null) return;

    const buyPrice = toNumber(buyInput);

    if (buyPrice <= 0) {
      window.alert('Alış fiyatı sıfırdan büyük olmalıdır.');
      return;
    }

    const sellInput = window.prompt('Satış fiyatını yazın:');
    if (sellInput === null) return;

    const sellPrice = toNumber(sellInput);

    if (sellPrice <= 0) {
      window.alert('Satış fiyatı sıfırdan büyük olmalıdır.');
      return;
    }

    setProcessing(true);

    try {
      await addDoc(
        collection(
          firestoreDb,
          'users',
          userId,
          'closed'
        ),
        {
          code,
          market,
          quantity,
          buyPrice,
          sellPrice,
          profitLoss: quantity * (sellPrice - buyPrice),
          closedAt: new Date().toISOString(),
        }
      );
    } catch (error) {
      console.error('Kapanan pozisyon ekleme hatası:', error);
      window.alert(
        `Kayıt eklenemedi: ${error?.message || 'Bilinmeyen hata'}`
      );
    } finally {
      setProcessing(false);
    }
  }

  async function removeClosedPosition(position) {
    const confirmed = window.confirm(
      `${position.code} kapanan pozisyon kaydı silinsin mi?`
    );

    if (!confirmed) return;

    setProcessing(true);

    try {
      await deleteDoc(
        doc(
          firestoreDb,
          'users',
          userId,
          'closed',
          position.id
        )
      );
    } catch (error) {
      console.error('Kapanan pozisyon silme hatası:', error);
      window.alert(
        `Kayıt silinemedi: ${error?.message || 'Bilinmeyen hata'}`
      );
    } finally {
      setProcessing(false);
    }
  }

  const bistClosedTotal = positions
    .filter((position) =>
      String(position.market || '').toLowerCase() === 'bist'
    )
    .reduce(
      (total, position) => total + toNumber(position.profitLoss),
      0
    );

  const nasdaqClosedTotal = positions
    .filter((position) =>
      ['us', 'nasdaq', 'abd'].includes(
        String(position.market || '').toLowerCase()
      )
    )
    .reduce(
      (total, position) => total + toNumber(position.profitLoss),
      0
    );

  return (
    <article style={styles.panelCard}>
      <div style={styles.panelHeader}>
        <button
          type="button"
          onClick={() => setIsExpanded((current) => !current)}
          aria-expanded={isExpanded}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: 0,
            border: 0,
            color: '#f8fafc',
            background: 'transparent',
            fontFamily: 'inherit',
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <h3 style={styles.panelTitle}>
          {title}
        </h3>

          <span
            style={{
              color: '#f0d675',
              fontSize: 12,
              fontWeight: 900,
            }}
          >
            {isExpanded ? '▲ Kapat' : '▼ Göster'}
          </span>
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={styles.panelBadge}>{positions.length} işlem</span>

          <button
            type="button"
            onClick={addClosedPosition}
            disabled={processing}
            style={{
              border: '1px solid rgba(212,175,55,0.42)',
              borderRadius: 8,
              padding: '6px 10px',
              background: '#151109',
              color: '#f8fafc',
              cursor: processing ? 'default' : 'pointer',
              opacity: processing ? 0.55 : 1,
              fontWeight: 700,
            }}
          >
            + Ekle
          </button>
        </div>
      </div>

      <div
        style={{
          ...styles.closedHeader,
          display: isExpanded ? 'grid' : 'none',
          gridTemplateColumns: '1.3fr 0.9fr 0.9fr 0.9fr 44px',
        }}
      >
        <span>Hisse</span>
        <span>Alış</span>
        <span>Satış</span>
        <span>K/Z</span>
        <span></span>
      </div>

      <div
        style={
          isExpanded
            ? styles.panelList
            : { display: 'none' }
        }
      >
        {positions.length === 0 ? (
          <div style={styles.panelEmpty}>
            Henüz kapanan pozisyon yok. “+ Ekle” düğmesiyle kayıt ekleyebilirsiniz.
          </div>
        ) : (
          positions.slice(0, 20).map((position) => {
            const currency = position.market === 'bist' ? 'TRY' : 'USD';
            const profitLoss = toNumber(position.profitLoss);

            return (
              <div
                key={position.id}
                style={{
                  ...styles.closedRow,
                  gridTemplateColumns:
                    '1.3fr 0.9fr 0.9fr 0.9fr 44px',
                }}
              >
                <div>
                  <strong style={styles.listPrimary}>
                    {position.code}
                  </strong>
                  <span style={styles.listSecondary}>
                    {position.market === 'bist' ? 'BIST' : 'NASDAQ'}
                    {' · '}
                    {formatNumber(position.quantity)}
                  </span>
                </div>

                <span>
                  {formatMoney(position.buyPrice, currency)}
                </span>

                <span>
                  {formatMoney(position.sellPrice, currency)}
                </span>

                <strong
                  style={{
                    color: profitLoss >= 0 ? '#22c55e' : '#ef4444',
                  }}
                >
                  {formatMoney(profitLoss, currency)}
                </strong>

                <button
                  type="button"
                  onClick={() => removeClosedPosition(position)}
                  disabled={processing}
                  title="Kaydı sil"
                  style={{
                    border: '1px solid #7f1d1d',
                    borderRadius: 7,
                    background: '#450a0a',
                    color: '#fecaca',
                    cursor: processing ? 'default' : 'pointer',
                    fontWeight: 800,
                    height: 30,
                  }}
                >
                  ×
                </button>
              </div>
            );
          })
        )}
      </div>

    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
        gap: 12,
        marginTop: 18,
        paddingTop: 18,
        borderTop: '1px solid #26364d',
      }}
    >
      <div
        style={{
          padding: 16,
          border: '1px solid rgba(212,175,55,0.42)',
          borderRadius: 14,
          background: '#18140d',
        }}
      >
        <div style={{ color: '#94a3b8', marginBottom: 8 }}>
          🇹🇷 BIST Toplam K/Z
        </div>

        <strong
          style={{
            fontSize: 22,
            color: bistClosedTotal >= 0 ? '#22c55e' : '#ef4444',
          }}
        >
          {formatMoney(bistClosedTotal, 'TRY')}
        </strong>
      </div>

      <div
        style={{
          padding: 16,
          border: '1px solid rgba(212,175,55,0.42)',
          borderRadius: 14,
          background: '#18140d',
        }}
      >
        <div style={{ color: '#94a3b8', marginBottom: 8 }}>
          🇺🇸 NASDAQ Toplam K/Z
        </div>

        <strong
          style={{
            fontSize: 22,
            color: nasdaqClosedTotal >= 0 ? '#22c55e' : '#ef4444',
          }}
        >
          {formatMoney(nasdaqClosedTotal, 'USD')}
        </strong>
      </div>
    </div>

    </article>
  );
}
function ProfitCell({ hasValue, value, percent, currency }) {
  if (!hasValue) {
    return <div style={styles.waitingText}>Fiyat bekleniyor</div>;
  }

  const isPositive = value >= 0;

  return (
    <div
      style={{
        ...styles.profitCell,
        color: isPositive ? '#22c55e' : '#ef4444',
      }}
    >
      <strong>{formatMoney(value, currency)}</strong>
      <span>{formatPercent(percent)}</span>
    </div>
  );
}

async function fetchPrices(market, codes) {
  if (!Array.isArray(codes) || codes.length === 0) return {};

  const cleanCodes = [
    ...new Set(
      codes
        .map((code) => String(code || '').trim().toUpperCase())
        .filter(Boolean)
    ),
  ];

  const response = await fetch('/api/prices', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify({ market, codes: cleanCodes }),
  });

  if (!response.ok) {
    let errorMessage = `Fiyat servisi hatası: ${response.status}`;

    try {
      const errorData = await response.json();
      errorMessage =
        errorData?.error || errorData?.message || errorMessage;
    } catch {}

    throw new Error(errorMessage);
  }

  const data = await response.json();
  const rawPrices = data?.prices ?? data?.data ?? data ?? {};
  const result = {};

  if (Array.isArray(rawPrices)) {
    rawPrices.forEach((item) => {
      const code = String(
        item?.code ?? item?.symbol ?? ''
      ).trim().toUpperCase();

      if (!code) return;

      result[`${market}:${code}`] = {
        ...(
          item &&
          typeof item === 'object'
            ? item
            : {}
        ),
        price: toNumber(
          item?.price ??
            item?.regularMarketPrice ??
            item?.currentPrice
        ),
        previousClose: toNumber(
          item?.previousClose ??
            item?.regularMarketPreviousClose
        ),
        changePercent: toNumber(
          item?.changePercent ??
            item?.regularMarketChangePercent
        ),
        dayLow: toNumber(
          item?.dayLow ??
            item?.regularMarketDayLow ??
            item?.low
        ),
        dayHigh: toNumber(
          item?.dayHigh ??
            item?.regularMarketDayHigh ??
            item?.high
        ),
      };
    });

    return result;
  }

  Object.entries(rawPrices).forEach(([key, item]) => {
    const code = String(
      item?.code ?? item?.symbol ?? key
    ).trim().toUpperCase();

    if (!code) return;

    result[`${market}:${code}`] = {
      ...(
        item &&
        typeof item === 'object'
          ? item
          : {}
      ),
      price: toNumber(
        item?.price ??
          item?.regularMarketPrice ??
          item?.currentPrice ??
          item
      ),
      previousClose: toNumber(
        item?.previousClose ??
          item?.regularMarketPreviousClose
      ),
      changePercent: toNumber(
        item?.changePercent ??
          item?.regularMarketChangePercent
      ),
      dayLow: toNumber(
        item?.dayLow ??
          item?.regularMarketDayLow ??
          item?.low
      ),
      dayHigh: toNumber(
        item?.dayHigh ??
          item?.regularMarketDayHigh ??
          item?.high
      ),
    };
  });

  return result;
}

function calculateSummary(stocks, prices) {
  const summary = stocks.reduce(
    (result, stock) => {
      const code = String(stock.code || '').trim().toUpperCase();
      const liveData = prices[`${stock.market}:${code}`] || {};
      const quantity = toNumber(
        stock.quantity ?? stock.lot ?? stock.amount
      );
      const costPrice = toNumber(
        stock.costPrice ?? stock.cost ?? stock.buyPrice
      );
      const currentPrice = toNumber(
        liveData.price ?? stock.currentPrice
      );

      if (quantity <= 0 || costPrice <= 0 || currentPrice <= 0) {
        return result;
      }

      result.totalCost += quantity * costPrice;
      result.currentValue += quantity * currentPrice;
      return result;
    },
    { totalCost: 0, currentValue: 0 }
  );

  const profitLoss = summary.currentValue - summary.totalCost;
  const profitLossPercent =
    summary.totalCost > 0
      ? (profitLoss / summary.totalCost) * 100
      : 0;

  return {
    ...summary,
    profitLoss,
    profitLossPercent,
  };
}

function calculateDailySummary(stocks, prices) {
  const summary = stocks.reduce(
    (result, stock) => {
      const code = String(stock.code || '').trim().toUpperCase();
      const liveData = prices[`${stock.market}:${code}`] || {};
      const quantity = toNumber(
        stock.quantity ?? stock.lot ?? stock.amount
      );
      const currentPrice = toNumber(liveData.price);
      const previousClose = toNumber(liveData.previousClose);

      if (quantity <= 0 || currentPrice <= 0 || previousClose <= 0) {
        return result;
      }

      const dailyProfitLoss =
        quantity * (currentPrice - previousClose);
      const previousValue = quantity * previousClose;

      result.profitLoss += dailyProfitLoss;
      result.previousValue += previousValue;
      return result;
    },
    { profitLoss: 0, previousValue: 0 }
  );

  const profitLossPercent =
    summary.previousValue > 0
      ? (summary.profitLoss / summary.previousValue) * 100
      : 0;

  return {
    ...summary,
    profitLossPercent,
  };
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0;

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  const text = String(value).trim().replace(/\s/g, '');
  if (!text) return 0;

  let normalized = text;
  const hasComma = normalized.includes(',');
  const hasDot = normalized.includes('.');

  if (hasComma && hasDot) {
    const lastComma = normalized.lastIndexOf(',');
    const lastDot = normalized.lastIndexOf('.');

    if (lastComma > lastDot) {
      normalized = normalized.replace(/\./g, '').replace(',', '.');
    } else {
      normalized = normalized.replace(/,/g, '');
    }
  } else if (hasComma) {
    normalized = normalized.replace(',', '.');
  }

  normalized = normalized.replace(/[^0-9.-]/g, '');
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value, currency) {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(toNumber(value));
}

function formatNumber(value) {
  return new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  }).format(toNumber(value));
}

function formatPercent(value) {
  const number = toNumber(value);
  const sign = number > 0 ? '+' : '';

  return `${sign}${number.toLocaleString('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
}

const styles = {
  page: {
    minHeight: '100vh',
    background: 'radial-gradient(circle at top, #211a0d 0%, #100d08 42%, #080706 100%)',
    color: '#f8fafc',
    padding: '20px',
    fontFamily: 'Arial, Helvetica, sans-serif',
  },
  loadingPage: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#0d0b07',
    padding: '20px',
    fontFamily: 'Arial, Helvetica, sans-serif',
  },
  loadingCard: {
    width: '100%',
    maxWidth: '420px',
    background: '#17130c',
    border: '1px solid rgba(212,175,55,0.25)',
    borderRadius: '18px',
    padding: '28px',
    textAlign: 'center',
    boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
  },
  loadingTitle: {
    color: '#f8fafc',
    margin: '0 0 10px',
    fontSize: '24px',
  },
  statusText: {
    color: '#94a3b8',
    margin: 0,
    lineHeight: 1.6,
  },
  header: {
    width: '100%',
    maxWidth: '1600px',
    margin: '0 auto 20px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '16px',
    flexWrap: 'wrap',
  },
  smallLabel: {
    margin: '0 0 5px',
    color: '#d4af37',
    fontSize: '12px',
    fontWeight: 700,
    letterSpacing: '1.5px',
  },
  pageTitle: {
    margin: 0,
    fontSize: 'clamp(28px, 6vw, 42px)',
    lineHeight: 1.1,
  },
  userText: {
    margin: '8px 0 0',
    color: '#94a3b8',
    fontSize: '14px',
  },
  logoutButton: {
    border: 'none',
    borderRadius: '12px',
    padding: '12px 18px',
    background: '#dc2626',
    color: '#ffffff',
    fontWeight: 700,
    cursor: 'pointer',
  },
  infoBox: {
    width: '100%',
    maxWidth: '1600px',
    margin: '0 auto 18px',
    background: 'rgba(212,175,55,0.08)',
    border: '1px solid rgba(212,175,55,0.26)',
    color: '#f0d98a',
    padding: '14px 16px',
    borderRadius: '12px',
  },
  summaryGrid: {
    width: '100%',
    maxWidth: '1600px',
    margin: '0 auto 18px',
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '14px',
  },
  summaryCard: {
    background: '#17130c',
    border: '1px solid rgba(212,175,55,0.22)',
    borderRadius: '16px',
    padding: '18px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    boxShadow: '0 12px 30px rgba(0,0,0,0.28), 0 0 0 1px rgba(212,175,55,0.03)',
  },
  summaryTitle: {
    margin: 0,
    color: '#94a3b8',
    fontSize: '13px',
  },
  summaryValue: {
    fontSize: '24px',
    lineHeight: 1.2,
  },
  summarySubtitle: {
    color: '#cbd5e1',
    fontSize: '13px',
  },
  priceBar: {
    width: '100%',
    maxWidth: '1600px',
    margin: '0 auto 18px',
    background: '#17130c',
    border: '1px solid rgba(212,175,55,0.22)',
    borderRadius: '14px',
    padding: '12px 14px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px',
    flexWrap: 'wrap',
    color: '#94a3b8',
    fontSize: '13px',
  },
  refreshButton: {
    border: '1px solid rgba(212,175,55,0.38)',
    borderRadius: '10px',
    padding: '10px 14px',
    background: 'rgba(212,175,55,0.10)',
    color: '#e6c65c',
    fontWeight: 700,
    cursor: 'pointer',
  },
  portfolioSection: {
    width: '100%',
    maxWidth: '1600px',
    margin: '0 auto 28px',
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '12px',
  },
  sectionTitle: {
    margin: 0,
    fontSize: '22px',
  },
  stockCount: {
    background: 'rgba(148,163,184,0.12)',
    color: '#cbd5e1',
    borderRadius: '999px',
    padding: '6px 10px',
    fontSize: '12px',
  },
  emptyBox: {
    background: '#17130c',
    border: '1px dashed rgba(148,163,184,0.3)',
    color: '#94a3b8',
    borderRadius: '14px',
    padding: '22px',
    textAlign: 'center',
  },
  tableWrapper: {
    width: '100%',
    overflowX: 'auto',
    background: '#17130c',
    border: '1px solid rgba(212,175,55,0.22)',
    borderRadius: '16px',
  },
  tableHeader: {
    minWidth: '1040px',
    display: 'grid',
    gridTemplateColumns: '1fr 0.65fr 0.9fr 0.9fr 1.15fr 1.15fr 1.05fr',
    gap: '14px',
    padding: '13px 16px',
    color: '#94a3b8',
    fontSize: '12px',
    fontWeight: 700,
    borderBottom: '1px solid rgba(212,175,55,0.18)',
  },
  stockRow: {
    minWidth: '1040px',
    display: 'grid',
    gridTemplateColumns: '1fr 0.65fr 0.9fr 0.9fr 1.15fr 1.15fr 1.05fr',
    gap: '14px',
    alignItems: 'center',
    padding: '15px 16px',
    borderBottom: '1px solid rgba(212,175,55,0.10)',
  },
  rowStockCode: {
    display: 'block',
    color: '#f8fafc',
    fontSize: '17px',
  },
  rowStockButton: {
    display: 'block',
    padding: 0,
    border: 0,
    background: 'transparent',
    color: '#e6c65c',
    fontSize: '17px',
    fontWeight: 800,
    cursor: 'pointer',
    textDecoration: 'underline',
    textDecorationColor: 'rgba(230,198,92,0.35)',
    textUnderlineOffset: '3px',
  },
  rowMarket: {
    color: '#64748b',
    fontSize: '10px',
    fontWeight: 700,
  },
  rowCell: {
    color: '#e2e8f0',
    fontSize: '14px',
  },
  profitCell: {
    display: 'flex',
    flexDirection: 'column',
    gap: '3px',
    fontSize: '13px',
  },
  waitingText: {
    color: '#94a3b8',
    fontSize: '13px',
  },
  actionCell: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
  },
  editButton: {
    padding: '8px 11px',
    borderRadius: '8px',
    border: '1px solid #d4af37',
    background: 'rgba(212,175,55,0.10)',
    color: '#e6c65c',
    cursor: 'pointer',
    fontWeight: 700,
  },
  sellButton: {
    padding: '8px 13px',
    borderRadius: '8px',
    border: '1px solid #ef4444',
    background: 'rgba(239,68,68,0.12)',
    color: '#f87171',
    cursor: 'pointer',
    fontWeight: 700,
  },

  dashboardPanels: {
    width: '100%',
    maxWidth: '1600px',
    margin: '0 auto 28px',
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
    gap: '18px',
    alignItems: 'stretch',
  },
  panelCard: {
    minWidth: 0,
    minHeight: '310px',
    background: '#17130c',
    border: '1px solid rgba(212,175,55,0.22)',
    borderRadius: '16px',
    padding: '18px',
    boxShadow: '0 12px 30px rgba(0,0,0,0.26), 0 0 22px rgba(212,175,55,0.025)',
  },
  panelHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '14px',
  },
  panelTitle: {
    margin: 0,
    fontSize: '19px',
  },
  panelBadge: {
    border: '1px solid rgba(212,175,55,0.38)',
    background: 'rgba(212,175,55,0.10)',
    color: '#e6c65c',
    borderRadius: '999px',
    padding: '5px 9px',
    fontSize: '11px',
    whiteSpace: 'nowrap',
  },
  watchlistManageButton: {
    minHeight: '29px',
    padding: '0 8px',
    border: '1px solid rgba(148,163,184,0.22)',
    borderRadius: '7px',
    background: 'rgba(255,255,255,0.025)',
    color: '#cbd5e1',
    fontFamily: 'inherit',
    fontSize: '10px',
    fontWeight: 800,
    whiteSpace: 'nowrap',
    cursor: 'pointer',
  },
  panelDescription: {
    margin: '0 0 12px',
    color: '#94a3b8',
    fontSize: '12px',
    lineHeight: 1.5,
  },
  panelList: {
    display: 'flex',
    flexDirection: 'column',
  },
  newsRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 0',
    borderBottom: '1px solid rgba(212,175,55,0.10)',
    color: '#f8fafc',
    textDecoration: 'none',
  },
  listPrimary: {
    display: 'block',
    color: '#f8fafc',
    fontSize: '13px',
  },
  listSecondary: {
    display: 'block',
    marginTop: '3px',
    color: '#94a3b8',
    fontSize: '10px',
  },
  marketChip: {
    color: '#e6c65c',
    fontSize: '10px',
    fontWeight: 700,
  },
  miniTableHeader: {
    display: 'grid',
    gridTemplateColumns: '1.25fr 0.85fr 0.85fr 0.85fr 0.7fr',
    gap: '10px',
    paddingBottom: '9px',
    color: '#64748b',
    fontSize: '10px',
    fontWeight: 700,
    borderBottom: '1px solid rgba(148,163,184,0.12)',
  },
  watchRow: {
    display: 'grid',
    gridTemplateColumns: '1.25fr 0.85fr 0.85fr 0.85fr 0.7fr',
    gap: '10px',
    alignItems: 'center',
    padding: '11px 0',
    borderBottom: '1px solid rgba(212,175,55,0.10)',
    fontSize: '12px',
  },
  watchPrice: {
    color: '#e2e8f0',
    fontSize: '12px',
  },
  closedHeader: {
    display: 'grid',
    gridTemplateColumns: '1.2fr 0.85fr 0.85fr 0.9fr',
    gap: '8px',
    paddingBottom: '9px',
    color: '#64748b',
    fontSize: '10px',
    fontWeight: 700,
    borderBottom: '1px solid rgba(148,163,184,0.12)',
  },
  closedRow: {
    display: 'grid',
    gridTemplateColumns: '1.2fr 0.85fr 0.85fr 0.9fr',
    gap: '8px',
    alignItems: 'center',
    padding: '11px 0',
    borderBottom: '1px solid rgba(212,175,55,0.10)',
    color: '#e2e8f0',
    fontSize: '11px',
  },
  panelEmpty: {
    padding: '24px 8px',
    color: '#94a3b8',
    fontSize: '12px',
    lineHeight: 1.6,
    textAlign: 'center',
  },
  fullChartSection: {
    width: '100%',
    maxWidth: '1600px',
    margin: '0 auto 28px',
  },
  fullChartWrapper: {
    width: '100%',
    height: '560px',
    background: '#17130c',
    border: '1px solid rgba(212,175,55,0.22)',
    borderRadius: '16px',
    overflow: 'hidden',
  },
};
