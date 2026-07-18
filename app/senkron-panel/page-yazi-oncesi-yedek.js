'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { addDoc, collection, deleteDoc, doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { firebaseAuth, firestoreDb } from '../../lib-firebase';
import TradingViewChart from './TradingViewChart';
export default function SenkronPanelPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [stocks, setStocks] = useState([]);
  const [closedPositions, setClosedPositions] = useState([]);
  const [prices, setPrices] = useState({});
  const [status, setStatus] = useState('PortfÃ¶y yÃ¼kleniyorâ€¦');
  const [priceStatus, setPriceStatus] = useState('');
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    let unsubscribePortfolio = null;
    let unsubscribeClosed = null;

    const unsubscribeAuth = onAuthStateChanged(firebaseAuth, (currentUser) => {
      if (unsubscribePortfolio) {
        unsubscribePortfolio();
        unsubscribePortfolio = null;
      }

      if (unsubscribeClosed) {
        unsubscribeClosed();
        unsubscribeClosed = null;
      }

      if (!currentUser) {
        setUser(null);
        setStocks([]);
        setStatus('GiriÅŸ ekranÄ±na yÃ¶nlendiriliyorâ€¦');
        router.replace('/login?next=/senkron-panel');
        return;
      }

      setUser(currentUser);
      setStatus('Firestore portfÃ¶yÃ¼ yÃ¼kleniyorâ€¦');

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
          console.error('PortfÃ¶y yÃ¼kleme hatasÄ±:', error);
          setStatus(`PortfÃ¶y yÃ¼klenemedi: ${error.message}`);
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
          console.error('Kapanan pozisyon yÃ¼kleme hatasÄ±:', error);
        }
      );
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribePortfolio) unsubscribePortfolio();
      if (unsubscribeClosed) unsubscribeClosed();
    };
  }, [router]);

  const fetchLivePrices = useCallback(async () => {
    if (stocks.length === 0) {
      setPrices({});
      setPriceStatus('');
      return;
    }

    setPriceStatus('CanlÄ± fiyatlar gÃ¼ncelleniyorâ€¦');

    try {
      const bistCodes = stocks
        .filter((stock) => stock.market === 'bist')
        .map((stock) => String(stock.code || '').trim().toUpperCase())
        .filter(Boolean);

      const usCodes = stocks
        .filter((stock) => stock.market === 'us')
        .map((stock) => String(stock.code || '').trim().toUpperCase())
        .filter(Boolean);

      const [bistData, usData] = await Promise.all([
        fetchPrices('bist', bistCodes),
        fetchPrices('us', usCodes),
      ]);

      setPrices({ ...bistData, ...usData });
      setPriceStatus(
        `Son gÃ¼ncelleme: ${new Date().toLocaleTimeString('tr-TR')}`
      );
    } catch (error) {
      console.error('CanlÄ± fiyat gÃ¼ncelleme hatasÄ±:', error);
      setPriceStatus(
        `CanlÄ± fiyat hatasÄ±: ${error?.message || 'Bilinmeyen hata'}`
      );
    }
  }, [stocks]);

  useEffect(() => {
    if (stocks.length === 0) return;

    fetchLivePrices();
    const timer = setInterval(fetchLivePrices, 30000);
    return () => clearInterval(timer);
  }, [stocks, fetchLivePrices]);

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

  async function logout() {
    setLoggingOut(true);
    try {
      await signOut(firebaseAuth);
      await fetch('/api/logout', { method: 'POST' });
    } catch (error) {
      console.error('Ã‡Ä±kÄ±ÅŸ hatasÄ±:', error);
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
          <p style={styles.smallLabel}>SKY FÄ°NANS</p>

          <h1 style={styles.pageTitle}>
            PortfÃ¶yÃ¼m
          </h1>

          <p style={styles.userText}>{user.email}</p>
        </div>

        <button
          type="button"
          onClick={logout}
          disabled={loggingOut}
          style={{ ...styles.logoutButton, opacity: loggingOut ? 0.6 : 1 }}
        >
          {loggingOut ? 'Ã‡Ä±kÄ±ÅŸ yapÄ±lÄ±yorâ€¦' : 'Ã‡Ä±kÄ±ÅŸ Yap'}
        </button>
      </header>

      {status ? <div style={styles.infoBox}>{status}</div> : null}

      <section style={styles.summaryGrid}>
        <SummaryCard
          title="BIST Toplam DeÄŸer"
          value={formatMoney(bistSummary.currentValue, 'TRY')}
          subtitle={`${bistStocks.length} hisse`}
        />
        <SummaryCard
          title="BIST KÃ¢r / Zarar"
          value={formatMoney(bistSummary.profitLoss, 'TRY')}
          subtitle={formatPercent(bistSummary.profitLossPercent)}
          positive={bistSummary.profitLoss >= 0}
        />
        <SummaryCard
          title="BIST GÃ¼nlÃ¼k K/Z"
          value={formatMoney(bistDailySummary.profitLoss, 'TRY')}
          subtitle={formatPercent(bistDailySummary.profitLossPercent)}
          positive={bistDailySummary.profitLoss >= 0}
        />
        <SummaryCard
          title="NASDAQ Toplam DeÄŸer"
          value={formatMoney(usSummary.currentValue, 'USD')}
          subtitle={`${usStocks.length} hisse`}
        />
        <SummaryCard
          title="NASDAQ KÃ¢r / Zarar"
          value={formatMoney(usSummary.profitLoss, 'USD')}
          subtitle={formatPercent(usSummary.profitLossPercent)}
          positive={usSummary.profitLoss >= 0}
        />
        <SummaryCard
          title="NASDAQ GÃ¼nlÃ¼k K/Z"
          value={formatMoney(usDailySummary.profitLoss, 'USD')}
          subtitle={formatPercent(usDailySummary.profitLossPercent)}
          positive={usDailySummary.profitLoss >= 0}
        />
      </section>

      <div style={styles.priceBar}>
        <span>{priceStatus || 'CanlÄ± fiyat bekleniyorâ€¦'}</span>
        <button
          type="button"
          onClick={fetchLivePrices}
          style={styles.refreshButton}
        >
          FiyatlarÄ± Yenile
        </button>
      </div>
      <PortfolioSection
        title="BIST PortfÃ¶yÃ¼"
        currency="TRY"
        stocks={bistStocks}
        prices={prices}
        userId={user.uid}
      />

      <PortfolioSection
        title="NASDAQ PortfÃ¶yÃ¼"
        currency="USD"
        stocks={usStocks}
        prices={prices}
        userId={user.uid}
      />

      <section style={styles.dashboardPanels}>
        <NewsPanel stocks={stocks} />
        <WatchlistPanel stocks={stocks} prices={prices} />
        <ClosedPositionsPanel positions={closedPositions} />
      </section>

      <section style={styles.fullChartSection}>
        <div style={styles.sectionHeader}>
          <h2 style={styles.sectionTitle}>CanlÄ± Grafik</h2>
          <span style={styles.stockCount}>EOSE</span>
        </div>

        <div style={styles.fullChartWrapper}>
          <TradingViewChart symbol="NASDAQ:EOSE" />
        </div>
      </section>
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
      `${stock.code} iÃ§in yeni lot miktarÄ±nÄ± yazÄ±n:`,
      String(currentQuantity)
    );

    if (quantityInput === null) return;

    const newQuantity = toNumber(quantityInput);

    if (newQuantity < 0) {
      window.alert('Lot miktarÄ± sÄ±fÄ±rdan kÃ¼Ã§Ã¼k olamaz.');
      return;
    }

    const costInput = window.prompt(
      `${stock.code} iÃ§in yeni ortalama maliyeti yazÄ±n:`,
      String(currentCost).replace('.', ',')
    );

    if (costInput === null) return;

    const newCost = toNumber(costInput);

    if (newCost < 0) {
      window.alert('Maliyet sÄ±fÄ±rdan kÃ¼Ã§Ã¼k olamaz.');
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
      console.error('Pozisyon gÃ¼ncelleme hatasÄ±:', error);
      window.alert(
        `Pozisyon gÃ¼ncellenemedi: ${
          error?.message || 'Bilinmeyen hata'
        }`
      );
    } finally {
      setProcessingId('');
    }
  }

  async function sellPosition(stock) {
    const code = String(stock.code || '').trim().toUpperCase();
    const quantity = toNumber(stock.quantity ?? stock.lot ?? stock.amount);
    const buyPrice = toNumber(stock.costPrice ?? stock.cost ?? stock.buyPrice);
    const liveData = prices[`${stock.market}:${code}`] || {};
    const suggestedSalePrice = toNumber(liveData.price ?? stock.currentPrice);

    const saleInput = window.prompt(
      `${code} iÃ§in satÄ±ÅŸ fiyatÄ±nÄ± yazÄ±n:`,
      suggestedSalePrice > 0 ? String(suggestedSalePrice).replace('.', ',') : ''
    );

    if (saleInput === null) return;

    const sellPrice = toNumber(saleInput);
    if (sellPrice <= 0) {
      window.alert('SatÄ±ÅŸ fiyatÄ± sÄ±fÄ±rdan bÃ¼yÃ¼k olmalÄ±dÄ±r.');
      return;
    }

    const confirmed = window.confirm(
      `${code} pozisyonu kapanan pozisyonlara taÅŸÄ±nacak. OnaylÄ±yor musunuz?`
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

      const closedRef = collection(
        firestoreDb,
        'users',
        userId,
        'closed'
      );

      await addDoc(closedRef, {
        code,
        market: stock.market,
        quantity,
        buyPrice,
        sellPrice,
        profitLoss: quantity * (sellPrice - buyPrice),
        closedAt: new Date().toISOString(),
      });

      await deleteDoc(stockRef);
    } catch (error) {
      console.error('Pozisyon kapatma hatasÄ±:', error);
      window.alert(
        `Pozisyon kapatÄ±lamadÄ±: ${error?.message || 'Bilinmeyen hata'}`
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
        <div style={styles.emptyBox}>Bu bÃ¶lÃ¼mde kayÄ±tlÄ± hisse yok.</div>
      ) : (
        <div style={styles.tableWrapper}>
          <div style={styles.tableHeader}>
            <div>Hisse</div>
            <div>Lot</div>
            <div>Maliyet</div>
            <div>GÃ¼ncel fiyat</div>
            <div>Toplam K/Z</div>
            <div>GÃ¼nlÃ¼k K/Z</div>
            <div>Ä°ÅŸlemler</div>
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
                  <strong style={styles.rowStockCode}>
                    {code || 'KOD YOK'}
                  </strong>
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
                    {isProcessing ? 'Bekleyinâ€¦' : 'DÃ¼zenle'}
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
  const [newsStatus, setNewsStatus] = useState('NASDAQ haberleri yÃ¼kleniyorâ€¦');

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
        setNewsStatus('NASDAQ haberleri yÃ¼kleniyorâ€¦');

        const query = new URLSearchParams({
          symbols: nasdaqSymbols.join(','),
        });

        const response = await fetch(`/api/news?${query.toString()}`, {
          cache: 'no-store',
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error('Haber servisi yanÄ±t vermedi.');
        }

        const payload = await response.json();
        const items = Array.isArray(payload.items) ? payload.items : [];

        setNews(items);
        setNewsStatus(
          items.length
            ? ''
            : 'Son 48 saatte uygun NASDAQ haberi bulunamadÄ±.'
        );
      } catch (error) {
        if (error.name !== 'AbortError') {
          setNews([]);
          setNewsStatus(
            'GÃ¼ncel NASDAQ haberleri alÄ±namadÄ±. Biraz sonra tekrar deneyin.'
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
        <span style={styles.panelBadge}>CanlÄ±</span>
      </div>

      <p style={styles.panelDescription}>
        Ã–nce portfÃ¶yÃ¼ndeki NASDAQ hisseleri, ardÄ±ndan Ã¶nemli genel NASDAQ ve ABD piyasa haberleri gÃ¶sterilir.
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
                {item.source || 'Finans Haberi'} Â· {item.timeLabel || 'Yeni'}
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

function WatchlistPanel({ stocks, prices }) {
  return (
    <article style={styles.panelCard}>
      <div style={styles.panelHeader}>
        <h3 style={styles.panelTitle}>Takip Listesi</h3>
        <span style={styles.panelBadge}>{stocks.length} hisse</span>
      </div>

      <div style={styles.miniTableHeader}>
        <span>Hisse</span>
        <span>Son</span>
        <span>DÃ¼ÅŸÃ¼k</span>
        <span>YÃ¼ksek</span>
        <span>GÃ¼nlÃ¼k</span>
      </div>

      <div style={styles.panelList}>
        {stocks.map((stock) => {
          const code = String(stock.code || '').trim().toUpperCase();
          const data = prices[`${stock.market}:${code}`] || {};
          const price = toNumber(data.price ?? stock.currentPrice);
          const previousClose = toNumber(data.previousClose);
          const dayLow = toNumber(data.dayLow);
          const dayHigh = toNumber(data.dayHigh);
          const change =
            price > 0 && previousClose > 0
              ? ((price - previousClose) / previousClose) * 100
              : 0;
          const currency = stock.market === 'bist' ? 'TRY' : 'USD';

          return (
            <div key={stock.id} style={styles.watchRow}>
              <div>
                <strong style={styles.listPrimary}>â˜† {code}</strong>
                <span style={styles.listSecondary}>
                  {stock.market === 'bist' ? 'BIST' : 'NASDAQ'}
                </span>
              </div>

              <span style={styles.watchPrice}>
                {price > 0 ? formatMoney(price, currency) : 'â€”'}
              </span>

              <span style={styles.watchPrice}>
                {dayLow > 0 ? formatMoney(dayLow, currency) : 'â€”'}
              </span>

              <span style={styles.watchPrice}>
                {dayHigh > 0 ? formatMoney(dayHigh, currency) : 'â€”'}
              </span>

              <strong style={{ color: change >= 0 ? '#22c55e' : '#ef4444' }}>
                {previousClose > 0 ? formatPercent(change) : 'â€”'}
              </strong>
            </div>
          );
        })}
      </div>
    </article>
  );
}

function ClosedPositionsPanel({ positions }) {
  return (
    <article style={styles.panelCard}>
      <div style={styles.panelHeader}>
        <h3 style={styles.panelTitle}>Kapanan Pozisyonlar</h3>
        <span style={styles.panelBadge}>{positions.length} iÅŸlem</span>
      </div>

      <div style={styles.closedHeader}>
        <span>Hisse</span>
        <span>AlÄ±ÅŸ</span>
        <span>SatÄ±ÅŸ</span>
        <span>K/Z</span>
      </div>

      <div style={styles.panelList}>
        {positions.length === 0 ? (
          <div style={styles.panelEmpty}>
            HenÃ¼z kapanan pozisyon yok. â€œSatâ€ iÅŸlemi yaptÄ±ÄŸÄ±nda burada gÃ¶rÃ¼necek.
          </div>
        ) : (
          positions.slice(0, 7).map((position) => {
            const currency = position.market === 'bist' ? 'TRY' : 'USD';
            const profitLoss = toNumber(position.profitLoss);

            return (
              <div key={position.id} style={styles.closedRow}>
                <div>
                  <strong style={styles.listPrimary}>{position.code}</strong>
                  <span style={styles.listSecondary}>
                    {position.market === 'bist' ? 'BIST' : 'NASDAQ'} Â· {formatNumber(position.quantity)}
                  </span>
                </div>
                <span>{formatMoney(position.buyPrice, currency)}</span>
                <span>{formatMoney(position.sellPrice, currency)}</span>
                <strong style={{ color: profitLoss >= 0 ? '#22c55e' : '#ef4444' }}>
                  {formatMoney(profitLoss, currency)}
                </strong>
              </div>
            );
          })
        )}
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
    let errorMessage = `Fiyat servisi hatasÄ±: ${response.status}`;

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
    background: 'linear-gradient(180deg, #07111f 0%, #0b1728 100%)',
    color: '#f8fafc',
    padding: '20px',
    fontFamily: 'Arial, Helvetica, sans-serif',
  },
  loadingPage: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#07111f',
    padding: '20px',
    fontFamily: 'Arial, Helvetica, sans-serif',
  },
  loadingCard: {
    width: '100%',
    maxWidth: '420px',
    background: '#111e31',
    border: '1px solid rgba(148,163,184,0.18)',
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
    color: '#38bdf8',
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
    background: 'rgba(56,189,248,0.10)',
    border: '1px solid rgba(56,189,248,0.25)',
    color: '#bae6fd',
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
    background: '#111e31',
    border: '1px solid rgba(148,163,184,0.16)',
    borderRadius: '16px',
    padding: '18px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    boxShadow: '0 10px 25px rgba(0,0,0,0.16)',
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
    background: '#111e31',
    border: '1px solid rgba(148,163,184,0.16)',
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
    border: '1px solid rgba(56,189,248,0.35)',
    borderRadius: '10px',
    padding: '10px 14px',
    background: 'rgba(56,189,248,0.12)',
    color: '#7dd3fc',
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
    background: '#111e31',
    border: '1px dashed rgba(148,163,184,0.3)',
    color: '#94a3b8',
    borderRadius: '14px',
    padding: '22px',
    textAlign: 'center',
  },
  tableWrapper: {
    width: '100%',
    overflowX: 'auto',
    background: '#111e31',
    border: '1px solid rgba(148,163,184,0.16)',
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
    borderBottom: '1px solid rgba(148,163,184,0.16)',
  },
  stockRow: {
    minWidth: '1040px',
    display: 'grid',
    gridTemplateColumns: '1fr 0.65fr 0.9fr 0.9fr 1.15fr 1.15fr 1.05fr',
    gap: '14px',
    alignItems: 'center',
    padding: '15px 16px',
    borderBottom: '1px solid rgba(148,163,184,0.10)',
  },
  rowStockCode: {
    display: 'block',
    color: '#f8fafc',
    fontSize: '17px',
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
    border: '1px solid #38bdf8',
    background: 'rgba(56,189,248,0.12)',
    color: '#7dd3fc',
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
    background: '#111e31',
    border: '1px solid rgba(148,163,184,0.16)',
    borderRadius: '16px',
    padding: '18px',
    boxShadow: '0 10px 25px rgba(0,0,0,0.14)',
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
    border: '1px solid rgba(56,189,248,0.35)',
    background: 'rgba(56,189,248,0.12)',
    color: '#7dd3fc',
    borderRadius: '999px',
    padding: '5px 9px',
    fontSize: '11px',
    whiteSpace: 'nowrap',
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
    borderBottom: '1px solid rgba(148,163,184,0.10)',
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
    color: '#7dd3fc',
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
    borderBottom: '1px solid rgba(148,163,184,0.10)',
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
    borderBottom: '1px solid rgba(148,163,184,0.10)',
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
    background: '#111e31',
    border: '1px solid rgba(148,163,184,0.16)',
    borderRadius: '16px',
    overflow: 'hidden',
  },
};