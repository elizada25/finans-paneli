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
} from 'firebase/firestore';
import { firestoreDb } from '../../lib-firebase';

const STORAGE_KEY =
  'sky-tradingview-chart-settings-v1';

const INDICATORS = [
  {
    key: 'RSI@tv-basicstudies',
    label: 'RSI',
  },
  {
    key: 'MACD@tv-basicstudies',
    label: 'MACD',
  },
  {
    key: 'MAExp@tv-basicstudies',
    label: 'EMA',
  },
  {
    key: 'MASimple@tv-basicstudies',
    label: 'SMA',
  },
  {
    key: 'Momentum@tv-basicstudies',
    label: 'MOM',
  },
];

const INTERVALS = [
  { value: '5', label: '5 dk' },
  { value: '15', label: '15 dk' },
  { value: '60', label: '1 sa' },
  { value: 'D', label: 'Günlük' },
  { value: 'W', label: 'Haftalık' },
];

const VALID_STUDIES = new Set(
  INDICATORS.map((item) => item.key)
);

const VALID_INTERVALS = new Set(
  INTERVALS.map((item) => item.value)
);

export default function TradingViewChart({
  symbol = 'NASDAQ:EOSE',
  userId,
  onRestoreSymbol,
}) {
  const containerRef = useRef(null);
  const restoreTargetRef = useRef(null);
  const restoreCallbackRef =
    useRef(onRestoreSymbol);

  const [studies, setStudies] = useState([]);
  const [interval, setInterval] = useState('D');
  const [settingsReady, setSettingsReady] =
    useState(false);
  const [saveStatus, setSaveStatus] =
    useState('Ayarlar yükleniyor…');

  restoreCallbackRef.current =
    onRestoreSymbol;

  const settingsRef = useMemo(() => {
    if (!userId) return null;

    return doc(
      firestoreDb,
      'users',
      userId,
      'settings',
      'tradingview-chart'
    );
  }, [userId]);

  useEffect(() => {
    setSettingsReady(false);

    if (!settingsRef) {
      try {
        const saved = JSON.parse(
          localStorage.getItem(
            STORAGE_KEY
          ) || '{}'
        );

        const savedStudies =
          Array.isArray(saved.studies)
            ? saved.studies.filter(
                (item) =>
                  VALID_STUDIES.has(item)
              )
            : [];

        setStudies(savedStudies);

        if (
          VALID_INTERVALS.has(
            saved.interval
          )
        ) {
          setInterval(saved.interval);
        }

        if (
          typeof saved.symbol ===
            'string' &&
          saved.symbol.includes(':')
        ) {
          restoreTargetRef.current =
            saved.symbol;

          restoreCallbackRef.current?.(
            saved.symbol
          );
        }

        setSaveStatus(
          'Bu cihazda kaydedildi'
        );
      } catch {
        setSaveStatus(
          'Ayarlar kaydedilecek'
        );
      }

      setSettingsReady(true);
      return;
    }

    const unsubscribe = onSnapshot(
      settingsRef,
      (snapshot) => {
        const saved = snapshot.exists()
          ? snapshot.data()
          : {};

        const savedStudies =
          Array.isArray(saved?.studies)
            ? saved.studies.filter(
                (item) =>
                  VALID_STUDIES.has(item)
              )
            : [];

        setStudies(savedStudies);

        if (
          VALID_INTERVALS.has(
            saved?.interval
          )
        ) {
          setInterval(saved.interval);
        }

        if (
          typeof saved?.symbol ===
            'string' &&
          saved.symbol.includes(':') &&
          saved.symbol !== symbol
        ) {
          restoreTargetRef.current =
            saved.symbol;

          restoreCallbackRef.current?.(
            saved.symbol
          );
        }

        setSaveStatus(
          snapshot.exists()
            ? 'Firebase ile kaydedildi'
            : 'Ayarlar kaydedilecek'
        );

        setSettingsReady(true);
      },
      (error) => {
        console.error(
          'Grafik ayarları okunamadı:',
          error
        );

        setSaveStatus(
          'Kayıt bağlantısı kurulamadı'
        );
        setSettingsReady(true);
      }
    );

    return unsubscribe;
  }, [settingsRef]);

  useEffect(() => {
    if (!settingsReady) return;

    if (
      restoreTargetRef.current &&
      symbol !== restoreTargetRef.current
    ) {
      return;
    }

    if (
      restoreTargetRef.current === symbol
    ) {
      restoreTargetRef.current = null;
    }

    const timer = window.setTimeout(
      async () => {
        const settings = {
          symbol,
          interval,
          studies,
          updatedAt:
            new Date().toISOString(),
        };

        setSaveStatus('Kaydediliyor…');

        try {
          if (settingsRef) {
            await setDoc(
              settingsRef,
              settings,
              { merge: true }
            );

            setSaveStatus(
              'Firebase ile kaydedildi'
            );
          } else {
            localStorage.setItem(
              STORAGE_KEY,
              JSON.stringify(settings)
            );

            setSaveStatus(
              'Bu cihazda kaydedildi'
            );
          }
        } catch (error) {
          console.error(
            'Grafik ayarları kaydedilemedi:',
            error
          );

          setSaveStatus(
            'Ayarlar kaydedilemedi'
          );
        }
      },
      450
    );

    return () =>
      window.clearTimeout(timer);
  }, [
    symbol,
    interval,
    studies,
    settingsReady,
    settingsRef,
  ]);

  useEffect(() => {
    if (
      !settingsReady ||
      !containerRef.current
    ) {
      return;
    }

    const container =
      containerRef.current;

    container.innerHTML = '';

    const widgetArea =
      document.createElement('div');

    widgetArea.className =
      'tradingview-widget-container__widget';

    widgetArea.style.height = '100%';
    widgetArea.style.width = '100%';

    const script =
      document.createElement('script');

    script.src =
      'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';

    script.type = 'text/javascript';
    script.async = true;

    script.text = JSON.stringify({
      autosize: true,
      symbol,
      interval,
      timezone: 'Europe/Istanbul',
      theme: 'dark',
      backgroundColor:
        'rgba(7, 13, 22, 1)',
      style: '1',
      locale: 'tr',
      withdateranges: true,
      hide_side_toolbar: false,
      allow_symbol_change: true,
      save_image: true,
      calendar: false,
      studies,
      support_host:
        'https://www.tradingview.com',
    });

    container.appendChild(widgetArea);
    container.appendChild(script);

    return () => {
      container.innerHTML = '';
    };
  }, [
    symbol,
    interval,
    studies,
    settingsReady,
  ]);

  function toggleIndicator(indicator) {
    setStudies((current) =>
      current.includes(indicator)
        ? current.filter(
            (item) =>
              item !== indicator
          )
        : [...current, indicator]
    );
  }

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        minHeight: '620px',
        display: 'flex',
        flexDirection: 'column',
        gap: '9px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent:
            'space-between',
          gap: '10px',
          flexWrap: 'wrap',
          padding: '10px',
          borderRadius: '11px',
          border:
            '1px solid rgba(148,163,184,0.16)',
          background:
            'rgba(15,23,42,0.88)',
        }}
      >
        <div
          style={{
            display: 'flex',
            gap: '6px',
            flexWrap: 'wrap',
          }}
        >
          {INDICATORS.map((indicator) => {
            const selected =
              studies.includes(
                indicator.key
              );

            return (
              <button
                key={indicator.key}
                type="button"
                onClick={() =>
                  toggleIndicator(
                    indicator.key
                  )
                }
                style={{
                  minHeight: '32px',
                  padding: '0 10px',
                  borderRadius: '8px',
                  border: selected
                    ? '1px solid rgba(56,189,248,0.65)'
                    : '1px solid rgba(148,163,184,0.20)',
                  background: selected
                    ? 'rgba(56,189,248,0.16)'
                    : 'rgba(255,255,255,0.035)',
                  color: selected
                    ? '#7dd3fc'
                    : '#cbd5e1',
                  cursor: 'pointer',
                  fontWeight: 850,
                  fontSize: '11px',
                }}
              >
                {selected ? '✓ ' : ''}
                {indicator.label}
              </button>
            );
          })}
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '7px',
            flexWrap: 'wrap',
          }}
        >
          <select
            value={interval}
            onChange={(event) =>
              setInterval(
                event.target.value
              )
            }
            style={{
              minHeight: '32px',
              padding: '0 8px',
              borderRadius: '8px',
              border:
                '1px solid rgba(212,175,55,0.28)',
              background: '#0a101a',
              color: '#f8fafc',
              fontWeight: 750,
            }}
          >
            {INTERVALS.map((item) => (
              <option
                key={item.value}
                value={item.value}
              >
                {item.label}
              </option>
            ))}
          </select>

          <a
            href={`https://www.tradingview.com/chart/?symbol=${encodeURIComponent(
              symbol
            )}`}
            target="_blank"
            rel="noreferrer"
            style={{
              minHeight: '32px',
              display: 'inline-flex',
              alignItems: 'center',
              padding: '0 10px',
              borderRadius: '8px',
              border:
                '1px solid rgba(212,175,55,0.28)',
              color: '#f0d675',
              textDecoration: 'none',
              fontSize: '10px',
              fontWeight: 850,
            }}
          >
            Çizim için TradingView ↗
          </a>
        </div>

        <span
          style={{
            width: '100%',
            color: saveStatus.includes(
              'kaydedilemedi'
            )
              ? '#fca5a5'
              : '#86efac',
            fontSize: '9px',
          }}
        >
          ● {saveStatus}
        </span>
      </div>

      <div
        ref={containerRef}
        className="tradingview-widget-container"
        style={{
          width: '100%',
          flex: 1,
          minHeight: '520px',
          overflow: 'hidden',
          borderRadius: '11px',
        }}
      />
    </div>
  );
}
