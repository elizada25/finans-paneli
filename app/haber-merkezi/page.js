'use client';

import Link from 'next/link';
import FutureSectors from './FutureSectors';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

const CATEGORY_ORDER = [
  'TÜMÜ',
  'SON DAKİKA',
  'TEKNOLOJİ',
  'BİLANÇO',
  'BİYOTEKNOLOJİ',
  'ENERJİ',
  'MAKRO',
  'ÖĞREN',
];

const CATEGORY_ICONS = {
  'TÜMÜ': '◉',
  'SON DAKİKA': '⚡',
  'TEKNOLOJİ': '◈',
  'BİLANÇO': '▤',
  'BİYOTEKNOLOJİ': '✚',
  'ENERJİ': '◆',
  'MAKRO': '◎',
  'ÖĞREN': '◇',
};

export default function HaberMerkeziPage() {
  const [items, setItems] = useState([]);
  const [generatedAt, setGeneratedAt] = useState(null);
  const [activeCategory, setActiveCategory] =
    useState('TÜMÜ');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadNews = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      const response = await fetch(
        '/api/news?mode=portal&limit=60',
        { cache: 'no-store' }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error || 'Haberler alınamadı.'
        );
      }

      setItems(
        Array.isArray(data?.items) ? data.items : []
      );
      setGeneratedAt(data?.generatedAt || null);
    } catch (newsError) {
      setError(
        newsError?.message ||
          'Haber merkezi yüklenemedi.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNews();

    const intervalId = window.setInterval(
      loadNews,
      15 * 60 * 1000
    );

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadNews();
      }
    };

    document.addEventListener(
      'visibilitychange',
      handleVisibilityChange
    );

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener(
        'visibilitychange',
        handleVisibilityChange
      );
    };
  }, [loadNews]);

  const categories = useMemo(() => {
    const available = new Set(
      items.map((item) => item.category)
    );

    return CATEGORY_ORDER.filter(
      (category) =>
        category === 'TÜMÜ' ||
        available.has(category)
    );
  }, [items]);

  const categoryCounts = useMemo(() => {
    const counts = { TÜMÜ: items.length };

    for (const item of items) {
      counts[item.category] =
        (counts[item.category] || 0) + 1;
    }

    return counts;
  }, [items]);

  const filteredItems = useMemo(() => {
    const normalizedSearch = normalize(search);

    return items.filter((item) => {
      const categoryMatches =
        activeCategory === 'TÜMÜ' ||
        item.category === activeCategory;

      const searchMatches =
        !normalizedSearch ||
        normalize(
          `${item.titleTr || item.title} ${item.title} ${item.source} ${item.category}`
        ).includes(normalizedSearch);

      return categoryMatches && searchMatches;
    });
  }, [activeCategory, items, search]);

  const readingItems = useMemo(
    () =>
      items
        .filter((item) => item.category === 'ÖĞREN')
        .slice(0, 5),
    [items]
  );

  const sourceCount = useMemo(
    () =>
      new Set(
        items
          .map((item) => item.source)
          .filter(Boolean)
      ).size,
    [items]
  );

  const featured = filteredItems[0];
  const remainingItems = filteredItems.slice(1);

  return (
    <main className="page">
      <div className="shell">
        <nav className="topbar">
          <Link href="/senkron-panel" className="backLink">
            ← Senkron Panele Dön
          </Link>

          <div className="topActions">
            <div className="liveBadge">
              <span className="liveDot" />
              Canlı haber akışı
            </div>
          </div>
        </nav>

        <header className="hero">
          <div className="heroGlow" />

          <div className="heroContent">
            <p className="eyebrow">
              SKY FİNANS • NASDAQ
            </p>

            <h1>Haber Merkezi</h1>

            <p className="heroText">
              NASDAQ şirketleri, sektör hareketleri,
              bilançolar ve makro gelişmeler tek
              ekranda. Haberleri Türkçe başlıklarla
              keşfet, neden önemli olduklarını öğren.
            </p>

            <div className="heroActions">
              <button
                type="button"
                className="refreshButton"
                onClick={loadNews}
                disabled={loading}
              >
                {loading
                  ? 'Haberler yenileniyor…'
                  : '↻ Haberleri Yenile'}
              </button>

              <span className="updatedAt">
                {generatedAt
                  ? `Son güncelleme: ${formatDateTime(
                      generatedAt
                    )}`
                  : 'Güncel piyasa akışı'}
              </span>
            </div>
          </div>

          <div className="stats">
            <Stat
              value={items.length}
              label="Güncel içerik"
            />
            <Stat
              value={sourceCount}
              label="Farklı kaynak"
            />
            <Stat
              value={Math.max(
                categories.length - 1,
                0
              )}
              label="Haber kategorisi"
            />
          </div>
        </header>

        <FutureSectors />

        <section className="controls">
          <div className="searchBox">
            <span>⌕</span>
            <input
              type="search"
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
              placeholder="Haber, şirket veya kaynak ara…"
            />
          </div>

          <div className="categories">
            {categories.map((category) => (
              <button
                key={category}
                type="button"
                className={
                  activeCategory === category
                    ? 'categoryButton active'
                    : 'categoryButton'
                }
                onClick={() =>
                  setActiveCategory(category)
                }
              >
                <span>
                  {CATEGORY_ICONS[category] || '•'}
                </span>
                {category}
                <small>
                  {categoryCounts[category] || 0}
                </small>
              </button>
            ))}
          </div>
        </section>

        {error ? (
          <div className="errorBox">
            <strong>Haber akışı yüklenemedi.</strong>
            <span>{error}</span>
            <button type="button" onClick={loadNews}>
              Tekrar Dene
            </button>
          </div>
        ) : null}

        {loading && !items.length ? (
          <LoadingState />
        ) : null}

        {!loading &&
        !error &&
        !filteredItems.length ? (
          <div className="emptyState">
            <strong>Sonuç bulunamadı</strong>
            <span>
              Arama kelimesini veya kategoriyi
              değiştirmeyi dene.
            </span>
          </div>
        ) : null}

        {featured ? (
          <section className="featuredSection">
            <div className="sectionHeading">
              <div>
                <p className="sectionEyebrow">
                  ÖNE ÇIKAN
                </p>
                <h2>Gündemin İlk Haberi</h2>
              </div>
              <span>
                {filteredItems.length} içerik
              </span>
            </div>

            <article className="featuredCard">
              <div className="featuredMark">
                {CATEGORY_ICONS[
                  featured.category
                ] || '◉'}
              </div>

              <div className="featuredBody">
                <div className="cardMeta">
                  <CategoryBadge
                    category={featured.category}
                  />
                  <span>
                    {formatDateTime(
                      featured.publishedAt
                    )}
                  </span>
                  <span>
                    {featured.source ||
                      'Kaynak belirtilmedi'}
                  </span>
                </div>

                <h2>
                  {featured.titleTr ||
                    featured.title}
                </h2>

                {featured.titleTr &&
                featured.titleTr !== featured.title ? (
                  <p className="originalTitle">
                    {featured.title}
                  </p>
                ) : null}

                <div className="whyBox">
                  <strong>Neden önemli?</strong>
                  <span>
                    {getWhyItMatters(
                      featured.category
                    )}
                  </span>
                </div>

                <a
                  href={featured.link}
                  target="_blank"
                  rel="noreferrer"
                  className="readButton"
                >
                  Haberin kaynağını aç ↗
                </a>
              </div>
            </article>
          </section>
        ) : null}

        {readingItems.length &&
        activeCategory === 'TÜMÜ' &&
        !search ? (
          <section className="readingSection">
            <div className="sectionHeading">
              <div>
                <p className="sectionEyebrow">
                  BUGÜN 10 DAKİKADA ÖĞREN
                </p>
                <h2>Günün Okumaları</h2>
              </div>
              <span>
                Finans bilgisini her gün geliştir
              </span>
            </div>

            <div className="readingGrid">
              {readingItems.map((item, index) => (
                <a
                  key={`${item.link}-${index}`}
                  href={item.link}
                  target="_blank"
                  rel="noreferrer"
                  className="readingCard"
                >
                  <span className="readingNumber">
                    {String(index + 1).padStart(2, '0')}
                  </span>

                  <div>
                    <small>
                      {item.source || 'Finans eğitimi'}
                    </small>
                    <strong>
                      {item.titleTr || item.title}
                    </strong>
                    <span>Okumaya başla ↗</span>
                  </div>
                </a>
              ))}
            </div>
          </section>
        ) : null}

        {remainingItems.length ? (
          <section className="newsSection">
            <div className="sectionHeading">
              <div>
                <p className="sectionEyebrow">
                  HABER AKIŞI
                </p>
                <h2>
                  {activeCategory === 'TÜMÜ'
                    ? 'NASDAQ Gündemi'
                    : activeCategory}
                </h2>
              </div>
              <span>
                En yeniden eskiye sıralandı
              </span>
            </div>

            <div className="newsGrid">
              {remainingItems.map((item, index) => (
                <NewsCard
                  key={`${item.link}-${index}`}
                  item={item}
                />
              ))}
            </div>
          </section>
        ) : null}

        <footer className="footer">
          <p>
            SKY Finans yalnızca haber başlıklarını,
            kısa açıklamaları ve kaynak bağlantılarını
            gösterir. İçeriklerin tamamı ilgili yayıncıya
            aittir.
          </p>
          <p>
            Haberler yatırım tavsiyesi değildir.
          </p>
        </footer>
      </div>

      <style jsx>{`
        * {
          box-sizing: border-box;
        }

        .page {
          min-height: 100vh;
          padding: 24px;
          color: #f8fafc;
          background:
            radial-gradient(
              circle at 12% 0%,
              rgba(30, 94, 86, 0.2),
              transparent 30%
            ),
            radial-gradient(
              circle at 90% 12%,
              rgba(52,211,153, 0.11),
              transparent 28%
            ),
            #070d16;
        }

        .shell {
          width: 100%;
          max-width: 1480px;
          margin: 0 auto;
        }

        .topbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 18px;
        }

        .backLink {
          color: #cbd5e1;
          font-size: 13px;
          font-weight: 800;
          text-decoration: none;
        }

        .backLink:hover {
          color: #6ee7b7;
        }

        .topActions {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 10px;
          flex-wrap: wrap;
        }

        .academyLink {
          padding: 8px 13px;
          border: 1px solid rgba(52,211,153, 0.32);
          border-radius: 999px;
          color: #6ee7b7;
          background: rgba(52,211,153, 0.08);
          font-size: 11px;
          font-weight: 900;
          text-decoration: none;
          white-space: nowrap;
          transition:
            border-color 160ms ease,
            background 160ms ease,
            transform 160ms ease;
        }

        .academyLink:hover {
          border-color: rgba(240, 214, 117, 0.7);
          background: rgba(52,211,153, 0.15);
          transform: translateY(-1px);
        }

        .liveBadge {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 7px 11px;
          border: 1px solid rgba(74, 222, 128, 0.22);
          border-radius: 999px;
          color: #86efac;
          background: rgba(34, 197, 94, 0.08);
          font-size: 11px;
          font-weight: 900;
        }

        .liveDot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #4ade80;
          box-shadow: 0 0 12px #4ade80;
        }

        .hero {
          position: relative;
          display: grid;
          grid-template-columns: minmax(0, 1.4fr) minmax(300px, 0.6fr);
          gap: 30px;
          overflow: hidden;
          padding: 36px;
          border: 1px solid rgba(52,211,153, 0.28);
          border-radius: 24px;
          background:
            linear-gradient(
              135deg,
              rgba(17, 39, 43, 0.98),
              rgba(13, 21, 34, 0.98)
            );
          box-shadow: 0 24px 70px rgba(0, 0, 0, 0.3);
        }

        .heroGlow {
          position: absolute;
          right: -80px;
          top: -120px;
          width: 360px;
          height: 360px;
          border-radius: 50%;
          background: rgba(52,211,153, 0.09);
          filter: blur(14px);
        }

        .heroContent,
        .stats {
          position: relative;
          z-index: 1;
        }

        .eyebrow,
        .sectionEyebrow {
          margin: 0 0 8px;
          color: #34d399;
          font-size: 11px;
          font-weight: 950;
          letter-spacing: 1.5px;
        }

        .hero h1 {
          margin: 0;
          font-size: clamp(34px, 5vw, 64px);
          line-height: 1;
          letter-spacing: -2px;
        }

        .heroText {
          max-width: 720px;
          margin: 18px 0 0;
          color: #aab8ca;
          font-size: 15px;
          line-height: 1.7;
        }

        .heroActions {
          display: flex;
          align-items: center;
          gap: 16px;
          flex-wrap: wrap;
          margin-top: 25px;
        }

        .refreshButton,
        .errorBox button {
          min-height: 42px;
          padding: 0 17px;
          border: 0;
          border-radius: 11px;
          color: #111827;
          background: linear-gradient(
            135deg,
            #34d399,
            #6ee7b7
          );
          font-weight: 950;
          cursor: pointer;
        }

        .refreshButton:disabled {
          cursor: wait;
          opacity: 0.65;
        }

        .updatedAt {
          color: #718096;
          font-size: 11px;
        }

        .stats {
          display: grid;
          grid-template-columns: 1fr;
          gap: 10px;
          align-content: center;
        }

        .controls {
          margin-top: 18px;
          padding: 16px;
          border: 1px solid rgba(148, 163, 184, 0.14);
          border-radius: 17px;
          background: rgba(15, 23, 42, 0.78);
        }

        .searchBox {
          display: flex;
          align-items: center;
          gap: 10px;
          height: 48px;
          padding: 0 14px;
          border: 1px solid rgba(148, 163, 184, 0.2);
          border-radius: 12px;
          background: rgba(4, 9, 17, 0.86);
        }

        .searchBox span {
          color: #34d399;
          font-size: 22px;
        }

        .searchBox input {
          width: 100%;
          border: 0;
          outline: 0;
          color: #f8fafc;
          background: transparent;
          font: inherit;
          font-size: 13px;
        }

        .categories {
          display: flex;
          gap: 8px;
          overflow-x: auto;
          padding-top: 13px;
          scrollbar-width: thin;
        }

        .categoryButton {
          display: flex;
          align-items: center;
          gap: 7px;
          flex: 0 0 auto;
          min-height: 38px;
          padding: 0 12px;
          border: 1px solid rgba(148, 163, 184, 0.16);
          border-radius: 999px;
          color: #94a3b8;
          background: rgba(255, 255, 255, 0.025);
          font-size: 10px;
          font-weight: 900;
          cursor: pointer;
        }

        .categoryButton small {
          display: grid;
          place-items: center;
          min-width: 20px;
          height: 20px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.06);
          font-size: 9px;
        }

        .categoryButton.active {
          border-color: rgba(52,211,153, 0.55);
          color: #f5dc7d;
          background: rgba(52,211,153, 0.12);
        }

        .sectionHeading {
          display: flex;
          align-items: end;
          justify-content: space-between;
          gap: 20px;
          margin: 34px 2px 14px;
        }

        .sectionHeading h2 {
          margin: 0;
          font-size: 23px;
        }

        .sectionHeading > span {
          color: #64748b;
          font-size: 11px;
        }

        .featuredCard {
          display: grid;
          grid-template-columns: 120px minmax(0, 1fr);
          overflow: hidden;
          border: 1px solid rgba(52,211,153, 0.28);
          border-radius: 20px;
          background:
            linear-gradient(
              135deg,
              rgba(30, 55, 54, 0.72),
              rgba(15, 23, 42, 0.92)
            );
        }

        .featuredMark {
          display: grid;
          place-items: center;
          color: #6ee7b7;
          background:
            linear-gradient(
              160deg,
              rgba(52,211,153, 0.18),
              rgba(34, 197, 94, 0.07)
            );
          font-size: 45px;
        }

        .featuredBody {
          padding: 26px;
        }

        .cardMeta {
          display: flex;
          align-items: center;
          gap: 8px 13px;
          flex-wrap: wrap;
          color: #718096;
          font-size: 10px;
        }

        .featuredBody h2 {
          max-width: 980px;
          margin: 17px 0 0;
          font-size: clamp(22px, 3vw, 35px);
          line-height: 1.24;
        }

        .originalTitle {
          margin: 10px 0 0;
          color: #718096;
          font-size: 11px;
          line-height: 1.5;
        }

        .whyBox {
          display: flex;
          gap: 8px;
          flex-direction: column;
          max-width: 800px;
          margin-top: 18px;
          padding: 13px 15px;
          border-left: 3px solid #34d399;
          border-radius: 0 10px 10px 0;
          color: #aab8ca;
          background: rgba(52,211,153, 0.06);
          font-size: 12px;
          line-height: 1.5;
        }

        .whyBox strong {
          color: #6ee7b7;
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.7px;
        }

        .readButton {
          display: inline-flex;
          align-items: center;
          min-height: 41px;
          margin-top: 19px;
          padding: 0 15px;
          border-radius: 10px;
          color: #111827;
          background: #6ee7b7;
          font-size: 11px;
          font-weight: 950;
          text-decoration: none;
        }

        .readingGrid {
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 10px;
        }

        .readingCard {
          display: flex;
          gap: 13px;
          min-height: 155px;
          padding: 16px;
          border: 1px solid rgba(56, 189, 248, 0.16);
          border-radius: 15px;
          color: #f8fafc;
          background:
            linear-gradient(
              145deg,
              rgba(10, 42, 55, 0.56),
              rgba(15, 23, 42, 0.86)
            );
          text-decoration: none;
          transition:
            transform 160ms ease,
            border-color 160ms ease;
        }

        .readingCard:hover,
        .newsCard:hover {
          transform: translateY(-3px);
          border-color: rgba(52,211,153, 0.42);
        }

        .readingNumber {
          color: #38bdf8;
          font-size: 12px;
          font-weight: 950;
        }

        .readingCard div {
          display: flex;
          flex-direction: column;
          gap: 9px;
        }

        .readingCard small {
          color: #64748b;
          font-size: 9px;
        }

        .readingCard strong {
          display: -webkit-box;
          overflow: hidden;
          font-size: 12px;
          line-height: 1.5;
          -webkit-line-clamp: 4;
          -webkit-box-orient: vertical;
        }

        .readingCard div > span {
          margin-top: auto;
          color: #7dd3fc;
          font-size: 9px;
          font-weight: 900;
        }

        .newsGrid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
        }

        .errorBox,
        .emptyState {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
          margin-top: 18px;
          padding: 18px;
          border-radius: 14px;
          color: #fecaca;
          background: rgba(239, 68, 68, 0.09);
          border: 1px solid rgba(239, 68, 68, 0.24);
          font-size: 12px;
        }

        .emptyState {
          flex-direction: column;
          align-items: flex-start;
          color: #94a3b8;
          background: rgba(15, 23, 42, 0.7);
          border-color: rgba(148, 163, 184, 0.15);
        }

        .footer {
          display: flex;
          justify-content: space-between;
          gap: 20px;
          margin-top: 35px;
          padding: 18px 2px;
          border-top: 1px solid rgba(148, 163, 184, 0.12);
          color: #526076;
          font-size: 10px;
          line-height: 1.5;
        }

        .footer p {
          margin: 0;
        }

        @media (max-width: 1100px) {
          .readingGrid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .newsGrid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 760px) {
          .page {
            padding: 12px;
          }

          .hero {
            grid-template-columns: 1fr;
            padding: 24px 18px;
          }

          .stats {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }

          .featuredCard {
            grid-template-columns: 1fr;
          }

          .featuredMark {
            min-height: 80px;
          }

          .readingGrid,
          .newsGrid {
            grid-template-columns: 1fr;
          }

          .sectionHeading {
            align-items: flex-start;
            flex-direction: column;
            gap: 6px;
          }

          .footer {
            flex-direction: column;
          }
        }
      `}</style>
    </main>
  );
}

function Stat({ value, label }) {
  return (
    <div className="stat">
      <strong>{value}</strong>
      <span>{label}</span>

      <style jsx>{`
        .stat {
          padding: 15px 17px;
          border: 1px solid rgba(148, 163, 184, 0.13);
          border-radius: 14px;
          background: rgba(0, 0, 0, 0.16);
        }

        strong {
          display: block;
          color: #6ee7b7;
          font-size: 25px;
        }

        span {
          display: block;
          margin-top: 3px;
          color: #718096;
          font-size: 10px;
          font-weight: 800;
        }
      `}</style>
    </div>
  );
}

function CategoryBadge({ category }) {
  return (
    <span className="badge">
      {CATEGORY_ICONS[category] || '•'} {category}

      <style jsx>{`
        .badge {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 5px 8px;
          border: 1px solid rgba(52,211,153, 0.24);
          border-radius: 999px;
          color: #6ee7b7;
          background: rgba(52,211,153, 0.09);
          font-size: 9px;
          font-weight: 950;
        }
      `}</style>
    </span>
  );
}

function NewsCard({ item }) {
  return (
    <article className="newsCard">
      <div className="cardTop">
        <CategoryBadge category={item.category} />
        <span>{formatDateTime(item.publishedAt)}</span>
      </div>

      <h3>{item.titleTr || item.title}</h3>

      {item.titleTr &&
      item.titleTr !== item.title ? (
        <p className="original">{item.title}</p>
      ) : null}

      <div className="importance">
        <strong>Neden önemli?</strong>
        <span>{getWhyItMatters(item.category)}</span>
      </div>

      <div className="cardFooter">
        <span>{item.source || 'Haber kaynağı'}</span>
        <a
          href={item.link}
          target="_blank"
          rel="noreferrer"
        >
          Kaynağı aç ↗
        </a>
      </div>

      <style jsx>{`
        .newsCard {
          display: flex;
          flex-direction: column;
          min-height: 285px;
          padding: 17px;
          border: 1px solid rgba(148, 163, 184, 0.14);
          border-radius: 16px;
          background:
            linear-gradient(
              145deg,
              rgba(18, 29, 43, 0.96),
              rgba(13, 20, 32, 0.96)
            );
          transition:
            transform 160ms ease,
            border-color 160ms ease;
        }

        .cardTop,
        .cardFooter {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }

        .cardTop > span {
          color: #526076;
          font-size: 9px;
        }

        h3 {
          display: -webkit-box;
          overflow: hidden;
          margin: 15px 0 0;
          color: #f8fafc;
          font-size: 16px;
          line-height: 1.42;
          -webkit-line-clamp: 4;
          -webkit-box-orient: vertical;
        }

        .original {
          display: -webkit-box;
          overflow: hidden;
          margin: 8px 0 0;
          color: #64748b;
          font-size: 9px;
          line-height: 1.45;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
        }

        .importance {
          display: flex;
          flex-direction: column;
          gap: 5px;
          margin-top: 14px;
          padding: 10px;
          border-radius: 9px;
          color: #94a3b8;
          background: rgba(255, 255, 255, 0.025);
          font-size: 10px;
          line-height: 1.45;
        }

        .importance strong {
          color: #34d399;
          font-size: 8px;
          letter-spacing: 0.5px;
          text-transform: uppercase;
        }

        .cardFooter {
          margin-top: auto;
          padding-top: 15px;
        }

        .cardFooter > span {
          max-width: 60%;
          overflow: hidden;
          color: #64748b;
          font-size: 9px;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        a {
          color: #6ee7b7;
          font-size: 9px;
          font-weight: 900;
          text-decoration: none;
        }
      `}</style>
    </article>
  );
}

function LoadingState() {
  return (
    <div className="loading">
      <div className="spinner" />
      <strong>NASDAQ haberleri hazırlanıyor…</strong>
      <span>
        Kaynaklar taranıyor ve başlıklar Türkçeye
        çevriliyor.
      </span>

      <style jsx>{`
        .loading {
          display: grid;
          place-items: center;
          gap: 10px;
          min-height: 320px;
          margin-top: 18px;
          border: 1px solid rgba(148, 163, 184, 0.12);
          border-radius: 18px;
          color: #94a3b8;
          background: rgba(15, 23, 42, 0.55);
          text-align: center;
        }

        .loading strong {
          color: #f8fafc;
          font-size: 14px;
        }

        .loading span {
          font-size: 10px;
        }

        .spinner {
          width: 34px;
          height: 34px;
          border: 3px solid rgba(52,211,153, 0.14);
          border-top-color: #34d399;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}

function normalize(value) {
  return String(value || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatDateTime(value) {
  if (!value) return 'Tarih belirtilmedi';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Tarih belirtilmedi';
  }

  return new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function getWhyItMatters(category) {
  const descriptions = {
    'SON DAKİKA':
      'Piyasanın genel risk iştahını ve NASDAQ yönünü kısa sürede etkileyebilir.',
    'TEKNOLOJİ':
      'Yapay zekâ, çip ve yazılım şirketlerinin büyüme beklentilerini etkileyebilir.',
    'BİLANÇO':
      'Gelir, kârlılık ve şirket beklentileri hisse fiyatlamasını değiştirebilir.',
    'BİYOTEKNOLOJİ':
      'Klinik sonuçlar ve düzenleyici kararlar şirket değerinde sert hareket oluşturabilir.',
    'ENERJİ':
      'Petrol, doğal gaz ve üretim görünümü enerji hisselerinin nakit akışını etkileyebilir.',
    'MAKRO':
      'Faiz, enflasyon ve tahvil hareketleri teknoloji hisselerinin değerlemesini etkileyebilir.',
    'ÖĞREN':
      'Bu içerik piyasa okuma ve yatırım kavramlarını geliştirmene yardımcı olabilir.',
  };

  return (
    descriptions[category] ||
    'Şirket ve piyasa beklentileri üzerinde etkili olabilecek güncel bir gelişme.'
  );
}
