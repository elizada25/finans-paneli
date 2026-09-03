'use client';

import {
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import { firestoreDb } from '../../../lib-firebase';
import { FINANS26_SEED } from './financeSeed';

const MONTHS = [
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık',
];

const CATEGORIES = [
  'Faturalar',
  'Kredi Kartı',
  'Banka / Kredi',
  'Kart / Banka',
  'Market',
  'Yakıt',
  'Ev',
  'Çocuk',
  'Sağlık',
  'Yatırım / Birikim',
  'Vergi',
  'Diğer',
];

const COLORS = [
  '#38bdf8',
  '#f59e0b',
  '#a855f7',
  '#22c55e',
  '#f97316',
  '#ec4899',
  '#14b8a6',
  '#eab308',
  '#ef4444',
  '#94a3b8',
];

function numeric(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  const cleaned = String(value || '')
    .trim()
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(',', '.');

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatTry(value) {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    minimumFractionDigits: 2,
  }).format(numeric(value));
}

function formatUsd(value) {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(numeric(value));
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return '—';

  return new Intl.NumberFormat('tr-TR', {
    style: 'percent',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function yearMonthId(year, month) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

async function fetchMonthlyFx(year, month) {
  const response = await fetch(`/api/fx?year=${year}&month=${month}`, {
    cache: 'no-store',
  });
  const data = await response.json();
  if (!response.ok || !Number.isFinite(Number(data?.rate)) || Number(data.rate) <= 0) {
    throw new Error(data?.error || 'Ayın ilk iş günü kuru alınamadı.');
  }
  return data;
}

export default function PersonalFinance({ userId, liveUsdTry = 0 }) {
  const now = new Date();
  const [expenses, setExpenses] = useState([]);
  const [capital, setCapital] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState('');
  const [imported, setImported] = useState(false);
  const [monthlyFx, setMonthlyFx] = useState(null);
  const [monthlyFxLoading, setMonthlyFxLoading] = useState(false);
  const [selectedYear, setSelectedYear] = useState(2026);
  const [selectedMonth, setSelectedMonth] = useState(
    now.getFullYear() === 2026 ? now.getMonth() + 1 : 8
  );
  const [expenseForm, setExpenseForm] = useState({
    name: '',
    category: 'Faturalar',
    institution: '',
    amount: '',
  });
  const [capitalForm, setCapitalForm] = useState({
    totalTry: '',
    note: '',
  });

  useEffect(() => {
    if (!userId) return undefined;

    const userRef = doc(firestoreDb, 'users', userId);
    const expenseRef = collection(userRef, 'personalFinanceExpenses');
    const capitalRef = collection(userRef, 'personalFinanceCapital');

    const unsubscribeExpenses = onSnapshot(
      expenseRef,
      (snapshot) => {
        setExpenses(
          snapshot.docs
            .map((item) => ({ id: item.id, ...item.data() }))
            .sort((first, second) => {
              const dateDifference =
                Number(first.yearMonth || 0) - Number(second.yearMonth || 0);

              if (dateDifference !== 0) return dateDifference;

              return String(first.name || '').localeCompare(
                String(second.name || ''),
                'tr'
              );
            })
        );
        setLoading(false);
      },
      (error) => {
        console.error('Giderler yüklenemedi:', error);
        setMessage(`Giderler yüklenemedi: ${error.message}`);
        setLoading(false);
      }
    );

    const unsubscribeCapital = onSnapshot(
      capitalRef,
      (snapshot) => {
        setCapital(
          snapshot.docs
            .map((item) => ({ id: item.id, ...item.data() }))
            .sort((first, second) =>
              String(first.id).localeCompare(String(second.id))
            )
        );
      },
      (error) => {
        console.error('Sermaye kayıtları yüklenemedi:', error);
        setMessage(`Sermaye kayıtları yüklenemedi: ${error.message}`);
      }
    );

    const settingsRef = doc(
      firestoreDb,
      'users',
      userId,
      'settings',
      'personal-finance'
    );

    getDoc(settingsRef)
      .then((snapshot) => {
        setImported(snapshot.data()?.finans26Imported === true);
      })
      .catch((error) => {
        console.error('Bütçe ayarları okunamadı:', error);
      });

    return () => {
      unsubscribeExpenses();
      unsubscribeCapital();
    };
  }, [userId]);

  const yearExpenses = useMemo(
    () =>
      expenses.filter((item) => Number(item.year) === Number(selectedYear)),
    [expenses, selectedYear]
  );

  const monthExpenses = useMemo(
    () =>
      yearExpenses.filter(
        (item) => Number(item.month) === Number(selectedMonth)
      ),
    [yearExpenses, selectedMonth]
  );

  const monthlyTotals = useMemo(
    () =>
      MONTHS.map((label, index) => ({
        month: index + 1,
        label,
        total: yearExpenses
          .filter((item) => Number(item.month) === index + 1)
          .reduce((sum, item) => sum + numeric(item.amount), 0),
      })),
    [yearExpenses]
  );

  const categoryTotals = useMemo(() => {
    const totals = new Map();

    yearExpenses.forEach((item) => {
      const category = String(item.category || 'Diğer');
      totals.set(category, (totals.get(category) || 0) + numeric(item.amount));
    });

    return [...totals.entries()]
      .map(([category, total]) => ({ category, total }))
      .sort((first, second) => second.total - first.total);
  }, [yearExpenses]);

  const yearCapital = useMemo(
    () =>
      capital.filter((item) => Number(item.year) === Number(selectedYear)),
    [capital, selectedYear]
  );

  const selectedCapital = useMemo(
    () =>
      capital.find(
        (item) =>
          Number(item.year) === Number(selectedYear) &&
          Number(item.month) === Number(selectedMonth)
      ) || null,
    [capital, selectedYear, selectedMonth]
  );

  const selectedCapitalUsd =
    selectedCapital && numeric(selectedCapital.usdTry) > 0
      ? numeric(selectedCapital.totalTry) / numeric(selectedCapital.usdTry)
      : 0;

  const selectedCapitalAtLiveUsd =
    selectedCapital && numeric(liveUsdTry) > 0
      ? numeric(selectedCapital.totalTry) / numeric(liveUsdTry)
      : 0;

  useEffect(() => {
    let active = true;
    setMonthlyFx(null);
    setMonthlyFxLoading(true);

    fetchMonthlyFx(selectedYear, selectedMonth)
      .then((data) => {
        if (active) setMonthlyFx(data);
      })
      .catch((error) => {
        if (active) setMonthlyFx({ error: error.message });
      })
      .finally(() => {
        if (active) setMonthlyFxLoading(false);
      });

    return () => { active = false; };
  }, [selectedYear, selectedMonth]);

  useEffect(() => {
    setCapitalForm({
      totalTry: selectedCapital
        ? String(selectedCapital.totalTry ?? '')
        : '',
      note: selectedCapital
        ? String(selectedCapital.note || '')
        : '',
    });
  }, [selectedCapital, selectedYear, selectedMonth]);

  const summary = useMemo(() => {
    const totalExpense = monthlyTotals.reduce(
      (sum, item) => sum + item.total,
      0
    );
    const activeMonths = monthlyTotals.filter((item) => item.total > 0);
    const highestMonth = activeMonths.reduce(
      (highest, item) =>
        !highest || item.total > highest.total ? item : highest,
      null
    );
    const latestCapital = yearCapital[yearCapital.length - 1] || null;
    const firstCapital = yearCapital[0] || null;
    const capitalChange =
      firstCapital && latestCapital && numeric(firstCapital.totalTry) > 0
        ? numeric(latestCapital.totalTry) / numeric(firstCapital.totalTry) - 1
        : null;
    const capitalUsd =
      latestCapital && numeric(latestCapital.usdTry) > 0
        ? numeric(latestCapital.totalTry) / numeric(latestCapital.usdTry)
        : 0;

    return {
      totalExpense,
      averageExpense: activeMonths.length
        ? totalExpense / activeMonths.length
        : 0,
      highestMonth,
      latestCapital,
      capitalChange,
      capitalUsd,
    };
  }, [monthlyTotals, yearCapital]);

  async function importFinans26() {
    if (!userId || imported || processing) return;

    const confirmed = window.confirm(
      'FİNANS26 dosyasındaki 2026 gider ve sermaye kayıtları bir kez içe aktarılsın mı?'
    );

    if (!confirmed) return;

    setProcessing(true);
    setMessage('Excel kayıtları içe aktarılıyor…');

    try {
      const batch = writeBatch(firestoreDb);

      FINANS26_SEED.expenses.forEach((item, index) => {
        const id = `${yearMonthId(item.year, item.month)}-${String(
          index + 1
        ).padStart(3, '0')}`;
        const target = doc(
          firestoreDb,
          'users',
          userId,
          'personalFinanceExpenses',
          id
        );

        batch.set(target, {
          ...item,
          yearMonth: item.year * 100 + item.month,
          source: 'FİNANS26.xlsm',
          importedAt: new Date().toISOString(),
        });
      });

      FINANS26_SEED.capital.forEach((item) => {
        const target = doc(
          firestoreDb,
          'users',
          userId,
          'personalFinanceCapital',
          yearMonthId(item.year, item.month)
        );

        batch.set(target, {
          ...item,
          source: 'FİNANS26.xlsm',
          importedAt: new Date().toISOString(),
        });
      });

      const settingsRef = doc(
        firestoreDb,
        'users',
        userId,
        'settings',
        'personal-finance'
      );

      batch.set(
        settingsRef,
        {
          finans26Imported: true,
          finans26ImportedAt: new Date().toISOString(),
        },
        { merge: true }
      );

      await batch.commit();
      setImported(true);
      setMessage('FİNANS26 kayıtları başarıyla içe aktarıldı.');
    } catch (error) {
      console.error('FİNANS26 içe aktarma hatası:', error);
      setMessage(`İçe aktarma başarısız: ${error.message}`);
    } finally {
      setProcessing(false);
    }
  }

  async function addExpense(event) {
    event.preventDefault();

    const name = expenseForm.name.trim().toUpperCase();
    const amount = numeric(expenseForm.amount);

    if (!name || amount <= 0) {
      setMessage('Gider adı ve sıfırdan büyük tutar yazmalısınız.');
      return;
    }

    const bankCategory = [
      'Kredi Kartı',
      'Banka / Kredi',
      'Kart / Banka',
    ].includes(expenseForm.category);

    if (bankCategory && !expenseForm.institution.trim()) {
      setMessage('Banka veya kredi kartı adını yazmalısınız.');
      return;
    }

    setProcessing(true);

    try {
      await addDoc(
        collection(
          firestoreDb,
          'users',
          userId,
          'personalFinanceExpenses'
        ),
        {
          year: Number(selectedYear),
          month: Number(selectedMonth),
          yearMonth: Number(selectedYear) * 100 + Number(selectedMonth),
          name,
          category: expenseForm.category,
          institution: expenseForm.institution.trim().toUpperCase(),
          amount,
          createdAt: new Date().toISOString(),
        }
      );

      setExpenseForm((current) => ({
        ...current,
        name: '',
        institution: '',
        amount: '',
      }));
      setMessage(`${name} gideri kaydedildi.`);
    } catch (error) {
      console.error('Gider ekleme hatası:', error);
      setMessage(`Gider kaydedilemedi: ${error.message}`);
    } finally {
      setProcessing(false);
    }
  }

  async function saveCapital(event) {
    event.preventDefault();

    const totalTry = numeric(capitalForm.totalTry);

    if (totalTry <= 0) {
      setMessage('Sermaye sıfırdan büyük olmalıdır.');
      return;
    }

    setProcessing(true);

    try {
      const fx = await fetchMonthlyFx(selectedYear, selectedMonth);
      await setDoc(
        doc(
          firestoreDb,
          'users',
          userId,
          'personalFinanceCapital',
          yearMonthId(selectedYear, selectedMonth)
        ),
        {
          year: Number(selectedYear),
          month: Number(selectedMonth),
          totalTry,
          usdTry: Number(fx.rate),
          usdTryDate: fx.rateDate,
          usdTrySource: fx.source,
          usdTryRateType: fx.rateType,
          usdTryPolicy: fx.policy,
          note: capitalForm.note.trim(),
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );

      setMonthlyFx(fx);
      setCapitalForm({ totalTry: '', note: '' });
      setMessage(
        `${MONTHS[selectedMonth - 1]} sermayesi, ${fx.rateDate} tarihli TCMB kuru ` +
        `(${Number(fx.rate).toLocaleString('tr-TR', { minimumFractionDigits: 4 })}) ile kaydedildi.`
      );
    } catch (error) {
      console.error('Sermaye kaydetme hatası:', error);
      setMessage(`Sermaye kaydedilemedi: ${error.message}`);
    } finally {
      setProcessing(false);
    }
  }

  async function repairYearFxRates() {
    if (!userId || processing) return;
    const records = capital.filter(
      (item) => Number(item.year) === Number(selectedYear) && numeric(item.totalTry) > 0
    );
    if (!records.length) {
      setMessage(`${selectedYear} için düzeltilecek sermaye kaydı yok.`);
      return;
    }
    if (!window.confirm(
      `${selectedYear} yılındaki ${records.length} sermaye kaydının dolar kuru, ` +
      `her ayın ilk TCMB iş günü kuruyla güncellensin mi? TL tutarları değişmeyecek.`
    )) return;

    setProcessing(true);
    setMessage('Geçmiş ayların ilk iş günü kurları alınıyor…');
    try {
      const rates = [];
      for (const item of records) {
        rates.push({ item, fx: await fetchMonthlyFx(item.year, item.month) });
      }
      const batch = writeBatch(firestoreDb);
      rates.forEach(({ item, fx }) => {
        batch.set(
          doc(firestoreDb, 'users', userId, 'personalFinanceCapital', yearMonthId(item.year, item.month)),
          {
            usdTry: Number(fx.rate), usdTryDate: fx.rateDate, usdTrySource: fx.source,
            usdTryRateType: fx.rateType, usdTryPolicy: fx.policy,
            usdTryCorrectedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      });
      await batch.commit();
      setMessage(`${rates.length} aylık kur TCMB ilk iş günü verileriyle düzeltildi.`);
    } catch (error) {
      console.error('Geçmiş kur düzeltme hatası:', error);
      setMessage(`Geçmiş kurlar düzeltilemedi: ${error.message}`);
    } finally {
      setProcessing(false);
    }
  }

  async function removeExpense(item) {
    if (!window.confirm(`${item.name} gideri silinsin mi?`)) return;

    try {
      await deleteDoc(
        doc(
          firestoreDb,
          'users',
          userId,
          'personalFinanceExpenses',
          item.id
        )
      );
      setMessage(`${item.name} gideri silindi.`);
    } catch (error) {
      setMessage(`Gider silinemedi: ${error.message}`);
    }
  }

  const maximumMonthlyExpense = Math.max(
    1,
    ...monthlyTotals.map((item) => item.total)
  );

  return (
    <section className="personalFinance">
      <style jsx>{`
        .personalFinance {
          width: 100%;
          max-width: 1600px;
          margin: 0 auto 28px;
          color: #e2e8f0;
        }

        .topLine,
        .filters,
        .actions {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }

        .topLine {
          justify-content: space-between;
          margin-bottom: 14px;
        }

        h2,
        h3,
        p {
          margin: 0;
        }

        h2 {
          color: #f8fafc;
          font-size: 21px;
        }

        h3 {
          margin-bottom: 12px;
          color: #f8fafc;
          font-size: 15px;
        }

        button,
        input,
        select {
          min-height: 36px;
          border: 1px solid rgba(148, 163, 184, 0.2);
          border-radius: 8px;
          color: #e2e8f0;
          background: #101827;
          font: inherit;
          box-sizing: border-box;
        }

        button {
          padding: 0 11px;
          font-weight: 850;
          cursor: pointer;
        }

        button:disabled {
          cursor: default;
          opacity: 0.5;
        }

        input,
        select {
          width: 100%;
          padding: 0 10px;
        }

        .primary {
          border-color: rgba(52,211,153, 0.5);
          color: #6ee7b7;
          background: rgba(52,211,153, 0.1);
        }

        .message {
          margin-bottom: 12px;
          color: #93c5fd;
          font-size: 11px;
        }

        .summaryGrid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 10px;
          margin-bottom: 12px;
        }

        .summaryCard,
        .card {
          border: 1px solid rgba(52,211,153, 0.19);
          background: #111821;
          box-shadow: 0 12px 30px rgba(0, 0, 0, 0.22);
        }

        .summaryCard {
          min-width: 0;
          padding: 13px;
          border-radius: 12px;
        }

        .summaryCard span {
          display: block;
          margin-bottom: 6px;
          color: #94a3b8;
          font-size: 10px;
        }

        .summaryCard strong {
          color: #f8fafc;
          font-size: 17px;
        }

        /* BUDGET-COLOR-V3-START */
        .summaryCard {
          position: relative;
          overflow: hidden;
        }

        .summaryCard::before {
          position: absolute;
          top: 0;
          right: 0;
          left: 0;
          height: 3px;
          content: '';
          background: var(--accent);
        }

        .summaryCard:nth-child(1) {
          --accent: #facc15;
          background: linear-gradient(145deg, rgba(250, 204, 21, 0.11), #111821 62%);
        }

        .summaryCard:nth-child(2) {
          --accent: #38bdf8;
          background: linear-gradient(145deg, rgba(56, 189, 248, 0.11), #111821 62%);
        }

        .summaryCard:nth-child(3) {
          --accent: #c084fc;
          background: linear-gradient(145deg, rgba(192, 132, 252, 0.11), #111821 62%);
        }

        .summaryCard:nth-child(4) {
          --accent: #2dd4bf;
          background: linear-gradient(145deg, rgba(45, 212, 191, 0.10), #111821 62%);
        }

        .summaryCard:nth-child(5) {
          --accent: #60a5fa;
          background: linear-gradient(145deg, rgba(96, 165, 250, 0.10), #111821 62%);
        }

        .summaryCard:nth-child(6) {
          --accent: #fb923c;
          background: linear-gradient(145deg, rgba(251, 146, 60, 0.10), #111821 62%);
        }

        .summaryCard:nth-child(7) {
          --accent: #f472b6;
          background: linear-gradient(145deg, rgba(244, 114, 182, 0.10), #111821 62%);
        }

        .summaryCard:nth-child(8) {
          --accent: #a78bfa;
          background: linear-gradient(145deg, rgba(167, 139, 250, 0.10), #111821 62%);
        }

        .summaryCard:nth-child(1) strong { color: #fde047; }
        .summaryCard:nth-child(2) strong { color: #7dd3fc; }
        .summaryCard:nth-child(3) strong { color: #d8b4fe; }
        .summaryCard:nth-child(4) strong { color: #5eead4; }
        .summaryCard:nth-child(5) strong { color: #93c5fd; }
        .summaryCard:nth-child(6) strong { color: #fdba74; }
        .summaryCard:nth-child(7) strong { color: #f9a8d4; }

        .mainGrid > .card:first-child {
          background:
            radial-gradient(circle at 0 0, rgba(250, 204, 21, 0.10), transparent 34%),
            #111821;
        }

        .mainGrid > .card:last-child {
          background:
            radial-gradient(circle at 100% 0, rgba(56, 189, 248, 0.09), transparent 34%),
            #111821;
        }

        .mainGrid > .card:first-child h3 {
          color: #fde68a;
        }

        .mainGrid > .card:last-child h3 {
          color: #7dd3fc;
        }

        .monthCapitalStrip > div {
          padding-left: 8px;
          border-left: 3px solid #38bdf8;
        }

        .monthCapitalStrip > div:nth-child(2) { border-left-color: #facc15; }
        .monthCapitalStrip > div:nth-child(3) { border-left-color: #2dd4bf; }
        .monthCapitalStrip > div:nth-child(4) { border-left-color: #c084fc; }
        /* BUDGET-COLOR-V3-END */

        .negative {
          color: #f87171 !important;
        }

        .positive {
          color: #4ade80 !important;
        }

        .mainGrid {
          display: grid;
          grid-template-columns: minmax(260px, 0.72fr) minmax(0, 1.8fr);
          gap: 12px;
        }

        .card {
          min-width: 0;
          padding: 14px;
          border-radius: 14px;
        }

        .formGrid {
          display: grid;
          gap: 8px;
        }

        .formLabel {
          display: grid;
          gap: 4px;
          color: #94a3b8;
          font-size: 10px;
          font-weight: 800;
        }

        .capitalForm {
          margin-top: 18px;
          padding-top: 16px;
          border-top: 1px solid rgba(148, 163, 184, 0.13);
        }

        .monthCapitalStrip {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 7px;
          margin-bottom: 10px;
          padding: 9px;
          border: 1px solid rgba(56, 189, 248, 0.18);
          border-radius: 10px;
          background: rgba(56, 189, 248, 0.045);
        }

        .monthCapitalStrip span {
          color: #94a3b8;
          font-size: 9px;
        }

        .monthCapitalStrip strong {
          display: block;
          margin-top: 3px;
          color: #f8fafc;
          font-size: 12px;
        }

        .useLiveRate {
          min-height: 30px;
          margin-top: 4px;
          font-size: 9px;
        }

        .autoFxInfo {
          padding: 10px;
          border: 1px solid rgba(45, 212, 191, 0.28);
          border-radius: 9px;
          color: #99f6e4;
          background: rgba(20, 184, 166, 0.08);
          font-size: 12px;
          line-height: 1.5;
        }

        .autoFxInfo strong {
          display: block;
          color: #f8fafc;
          font-size: 15px;
        }

        .barChart {
          display: grid;
          grid-template-columns: repeat(12, minmax(32px, 1fr));
          align-items: end;
          gap: 5px;
          min-height: 190px;
          padding: 12px 4px 0;
          overflow-x: auto;
          border-bottom: 1px solid rgba(148, 163, 184, 0.16);
        }

        .barItem {
          display: grid;
          grid-template-rows: 1fr auto;
          align-items: end;
          gap: 5px;
          height: 170px;
          min-width: 34px;
        }

        .bar {
          width: 100%;
          min-height: 2px;
          border-radius: 5px 5px 0 0;
          background: linear-gradient(180deg, #38bdf8, #0e7490);
        }

        .barItem span {
          color: #64748b;
          font-size: 8px;
          text-align: center;
        }

        .categoryList {
          display: grid;
          gap: 7px;
          margin-top: 16px;
        }

        .categoryRow {
          display: grid;
          grid-template-columns: 140px minmax(80px, 1fr) auto;
          align-items: center;
          gap: 8px;
          color: #cbd5e1;
          font-size: 10px;
        }

        .categoryTrack {
          height: 7px;
          overflow: hidden;
          border-radius: 99px;
          background: rgba(148, 163, 184, 0.12);
        }

        .categoryFill {
          height: 100%;
          border-radius: inherit;
        }

        .expenseTable {
          margin-top: 12px;
          overflow-x: auto;
          border: 1px solid rgba(148, 163, 184, 0.12);
          border-radius: 10px;
        }

        .expenseHeader,
        .expenseRow {
          display: grid;
          grid-template-columns:
            minmax(110px, 1.1fr)
            minmax(105px, 0.9fr)
            minmax(110px, 1fr)
            100px
            34px;
          align-items: center;
          gap: 8px;
          min-width: 480px;
        }

        .expenseHeader {
          padding: 8px 10px;
          color: #64748b;
          background: rgba(15, 23, 42, 0.78);
          font-size: 9px;
          font-weight: 900;
        }

        .expenseRow {
          padding: 7px 10px;
          border-top: 1px solid rgba(148, 163, 184, 0.09);
          font-size: 10px;
        }

        .expenseRow strong {
          text-align: right;
        }

        .remove {
          width: 28px;
          min-height: 27px;
          padding: 0;
          border-color: rgba(239, 68, 68, 0.38);
          color: #fca5a5;
          background: rgba(127, 29, 29, 0.25);
        }

        .empty {
          padding: 20px;
          color: #64748b;
          font-size: 11px;
          text-align: center;
        }

        /* BUDGET-TEXT-SIZE-V4 */
        .formLabel {
          font-size: 13px;
        }

        input,
        select {
          font-size: 14px;
          font-weight: 650;
        }

        .useLiveRate {
          font-size: 12px;
        }

        .categoryRow {
          font-size: 13px;
        }

        .categoryRow strong {
          font-size: 13px;
        }

        .expenseHeader {
          font-size: 12px;
        }

        .expenseRow {
          font-size: 13px;
        }

        .expenseRow strong {
          font-size: 13px;
        }

        .monthCapitalStrip span {
          font-size: 11px;
        }

        .monthCapitalStrip strong {
          font-size: 14px;
        }

        .barItem span {
          font-size: 10px;
        }

        .summaryCard span {
          font-size: 12px;
        }
        /* BUDGET-TEXT-SIZE-V4-END */

        @media (max-width: 1000px) {
          .summaryGrid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .mainGrid {
            grid-template-columns: 1fr;
          }

          .monthCapitalStrip {
            grid-template-columns: 1fr 1fr;
          }
        }

        @media (max-width: 600px) {
          .summaryGrid {
            grid-template-columns: 1fr 1fr;
            gap: 7px;
          }

          .summaryCard {
            padding: 10px;
          }

          .summaryCard strong {
            font-size: 14px;
          }

          .card {
            padding: 11px;
          }
        }
      `}</style>

      <div className="topLine">
        <div>
          <h2>₺ Bütçe ve Sermaye</h2>
          <p style={{ color: '#64748b', fontSize: 10, marginTop: 4 }}>
            Gider, kategori ve aylık toplam sermaye takibi
          </p>
        </div>

        <div className="filters">
          <select
            aria-label="Yıl"
            value={selectedYear}
            onChange={(event) => setSelectedYear(Number(event.target.value))}
            style={{ width: 90 }}
          >
            {[2026, 2027, 2028].map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>

          <select
            aria-label="Ay"
            value={selectedMonth}
            onChange={(event) => setSelectedMonth(Number(event.target.value))}
            style={{ width: 115 }}
          >
            {MONTHS.map((month, index) => (
              <option key={month} value={index + 1}>
                {month}
              </option>
            ))}
          </select>

          {!imported ? (
            <button
              type="button"
              className="primary"
              onClick={importFinans26}
              disabled={processing}
            >
              Excel 2026’yı içe aktar
            </button>
          ) : null}
        </div>
      </div>

      {message ? <div className="message">● {message}</div> : null}

      <div className="summaryGrid">
        <div className="summaryCard">
          <span>
            {MONTHS[selectedMonth - 1]} sermayesi (TL)
          </span>
          <strong>
            {selectedCapital
              ? formatTry(selectedCapital.totalTry)
              : '—'}
          </strong>
        </div>

        <div className="summaryCard">
          <span>
            {MONTHS[selectedMonth - 1]} kayıtlı USD/TRY
          </span>
          <strong>
            {selectedCapital && numeric(selectedCapital.usdTry) > 0
              ? numeric(selectedCapital.usdTry).toLocaleString('tr-TR', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 4,
                })
              : '—'}
          </strong>
        </div>

        <div className="summaryCard">
          <span>
            {MONTHS[selectedMonth - 1]} sermayesi (USD)
          </span>
          <strong>
            {selectedCapitalUsd ? formatUsd(selectedCapitalUsd) : '—'}
          </strong>
        </div>

        <div className="summaryCard">
          <span>Güncel USD/TRY</span>
          <strong>
            {numeric(liveUsdTry) > 0
              ? numeric(liveUsdTry).toLocaleString('tr-TR', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 4,
                })
              : '—'}
          </strong>
        </div>

        <div className="summaryCard">
          <span>Güncel kura göre sermaye (USD)</span>
          <strong>
            {selectedCapitalAtLiveUsd
              ? formatUsd(selectedCapitalAtLiveUsd)
              : '—'}
          </strong>
        </div>

        <div className="summaryCard">
          <span>Yıllık toplam harcama</span>
          <strong>{formatTry(summary.totalExpense)}</strong>
        </div>

        <div className="summaryCard">
          <span>Aylık ortalama</span>
          <strong>{formatTry(summary.averageExpense)}</strong>
        </div>

        <div className="summaryCard">
          <span>Yıllık sermaye değişimi</span>
          <strong
            className={
              Number(summary.capitalChange) >= 0 ? 'positive' : 'negative'
            }
          >
            {formatPercent(summary.capitalChange)}
          </strong>
        </div>
      </div>

      <div className="mainGrid">
        <div className="card">
          <h3>{MONTHS[selectedMonth - 1]} gideri ekle</h3>

          <form className="formGrid" onSubmit={addExpense}>
            <label className="formLabel">
              Gider adı
              <input
                value={expenseForm.name}
                onChange={(event) =>
                  setExpenseForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                placeholder="Elektrik, market, banka…"
              />
            </label>

            <label className="formLabel">
              Kategori
              <select
                value={expenseForm.category}
                onChange={(event) =>
                  setExpenseForm((current) => ({
                    ...current,
                    category: event.target.value,
                  }))
                }
              >
                {CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>

            <label className="formLabel">
              {[
                'Kredi Kartı',
                'Banka / Kredi',
                'Kart / Banka',
              ].includes(expenseForm.category)
                ? 'Banka / kredi kartı adı'
                : 'Kurum / satıcı (isteğe bağlı)'}
              <input
                value={expenseForm.institution}
                onChange={(event) =>
                  setExpenseForm((current) => ({
                    ...current,
                    institution: event.target.value,
                  }))
                }
                placeholder={
                  [
                    'Kredi Kartı',
                    'Banka / Kredi',
                    'Kart / Banka',
                  ].includes(expenseForm.category)
                    ? 'Garanti Bonus, İş Bankası Maximum…'
                    : 'TEDAŞ, Migros, Shell…'
                }
              />
            </label>

            <label className="formLabel">
              Tutar (TL)
              <input
                inputMode="decimal"
                value={expenseForm.amount}
                onChange={(event) =>
                  setExpenseForm((current) => ({
                    ...current,
                    amount: event.target.value,
                  }))
                }
                placeholder="0,00"
              />
            </label>

            <button className="primary" disabled={processing} type="submit">
              + Gideri kaydet
            </button>
          </form>

          <form className="formGrid capitalForm" onSubmit={saveCapital}>
            <h3>{MONTHS[selectedMonth - 1]} sermayesi</h3>

            <label className="formLabel">
              Toplam sermaye (TL)
              <input
                inputMode="decimal"
                value={capitalForm.totalTry}
                onChange={(event) =>
                  setCapitalForm((current) => ({
                    ...current,
                    totalTry: event.target.value,
                  }))
                }
                placeholder="0,00"
              />
            </label>

            <div className="autoFxInfo">
              Ayın ilk TCMB iş günü USD/TRY satış kuru
              <strong>
                {monthlyFxLoading
                  ? 'Kur alınıyor…'
                  : monthlyFx?.rate
                    ? `${Number(monthlyFx.rate).toLocaleString('tr-TR', {
                        minimumFractionDigits: 4,
                        maximumFractionDigits: 4,
                      })} • ${monthlyFx.rateDate}`
                    : monthlyFx?.error || 'Kur bulunamadı'}
              </strong>
              Kur otomatik kaydedilir; elle giriş gerekmez.
            </div>

            <label className="formLabel">
              Not
              <input
                value={capitalForm.note}
                onChange={(event) =>
                  setCapitalForm((current) => ({
                    ...current,
                    note: event.target.value,
                  }))
                }
                placeholder="İsteğe bağlı"
              />
            </label>

            <button className="primary" disabled={processing} type="submit">
              Sermayeyi kaydet / güncelle
            </button>

            <button
              className="useLiveRate"
              disabled={processing}
              type="button"
              onClick={repairYearFxRates}
            >
              {selectedYear} geçmiş kurlarını otomatik düzelt
            </button>
          </form>
        </div>

        <div className="card">
          <h3>{selectedYear} aylık harcama görünümü</h3>

          <div className="monthCapitalStrip">
            <div>
              <span>Seçili dönem</span>
              <strong>
                {MONTHS[selectedMonth - 1]} {selectedYear}
              </strong>
            </div>
            <div>
              <span>Sermaye (TL)</span>
              <strong>
                {selectedCapital
                  ? formatTry(selectedCapital.totalTry)
                  : 'Kayıt yok'}
              </strong>
            </div>
            <div>
              <span>Kayıtlı USD/TRY</span>
              <strong>
                {selectedCapital && numeric(selectedCapital.usdTry) > 0
                  ? numeric(selectedCapital.usdTry).toLocaleString('tr-TR', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 4,
                    })
                  : 'Kayıt yok'}
              </strong>
            </div>
            <div>
              <span>Sermaye (USD)</span>
              <strong>
                {selectedCapitalUsd
                  ? formatUsd(selectedCapitalUsd)
                  : 'Kayıt yok'}
              </strong>
            </div>
          </div>

          <div className="barChart">
            {monthlyTotals.map((item, index) => (
              <button
                key={item.month}
                type="button"
                className="barItem"
                title={`${item.label}: ${formatTry(item.total)}`}
                onClick={() => setSelectedMonth(item.month)}
                style={{
                  padding: 0,
                  border: 0,
                  background: 'transparent',
                }}
              >
                <span
                  className="bar"
                  style={{
                    height: `${Math.max(
                      2,
                      (item.total / maximumMonthlyExpense) * 145
                    )}px`,
                    opacity: selectedMonth === item.month ? 1 : 0.68,
                    background: `linear-gradient(180deg, ${
                      COLORS[index % COLORS.length]
                    }, ${COLORS[index % COLORS.length]}99)`,
                    boxShadow:
                      selectedMonth === item.month
                        ? `0 0 16px ${COLORS[index % COLORS.length]}66`
                        : 'none',
                  }}
                />
                <span>{item.label.slice(0, 3)}</span>
              </button>
            ))}
          </div>

          <div className="categoryList">
            {categoryTotals.map((item, index) => (
              <div className="categoryRow" key={item.category}>
                <span>{item.category}</span>
                <div className="categoryTrack">
                  <div
                    className="categoryFill"
                    style={{
                      width: `${
                        summary.totalExpense > 0
                          ? (item.total / summary.totalExpense) * 100
                          : 0
                      }%`,
                      background: COLORS[index % COLORS.length],
                    }}
                  />
                </div>
                <strong>{formatTry(item.total)}</strong>
              </div>
            ))}
          </div>

          <div className="expenseTable">
            <div className="expenseHeader">
              <span>Gider</span>
              <span>Kategori</span>
              <span>Banka / kurum</span>
              <span style={{ textAlign: 'right' }}>Tutar</span>
              <span />
            </div>

            {loading ? (
              <div className="empty">Kayıtlar yükleniyor…</div>
            ) : monthExpenses.length === 0 ? (
              <div className="empty">
                {MONTHS[selectedMonth - 1]} ayında kayıt yok.
              </div>
            ) : (
              monthExpenses.map((item) => (
                <div className="expenseRow" key={item.id}>
                  <span>{item.name}</span>
                  <span style={{ color: '#94a3b8' }}>{item.category}</span>
                  <span style={{ color: '#94a3b8' }}>
                    {item.institution ||
                      (item.category === 'Kart / Banka'
                        ? item.name
                        : '—')}
                  </span>
                  <strong>{formatTry(item.amount)}</strong>
                  <button
                    type="button"
                    className="remove"
                    onClick={() => removeExpense(item)}
                    aria-label={`${item.name} giderini sil`}
                    title="Gideri sil"
                  >
                    ×
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
