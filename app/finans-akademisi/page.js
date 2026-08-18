'use client';

import Link from 'next/link';
import {
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  ACADEMY_LESSONS,
  getDailyLessonIndex,
} from './lessons';

const STORAGE_KEY =
  'sky-finans-academy-completed-v1';

export default function FinansAkademisiPage() {
  const [todayIndex, setTodayIndex] = useState(0);
  const [currentIndex, setCurrentIndex] =
    useState(0);
  const [completedIds, setCompletedIds] =
    useState([]);
  const [storageReady, setStorageReady] =
    useState(false);
  const [selectedAnswer, setSelectedAnswer] =
    useState(null);
  const [answered, setAnswered] = useState(false);

  useEffect(() => {
    const dailyIndex = getDailyLessonIndex();
    setTodayIndex(dailyIndex);
    setCurrentIndex(dailyIndex);

    try {
      const saved = JSON.parse(
        window.localStorage.getItem(STORAGE_KEY) ||
          '[]'
      );

      setCompletedIds(
        Array.isArray(saved) ? saved : []
      );
    } catch {
      setCompletedIds([]);
    } finally {
      setStorageReady(true);
    }
  }, []);

  useEffect(() => {
    if (!storageReady) return;

    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(completedIds)
    );
  }, [completedIds, storageReady]);

  useEffect(() => {
    setSelectedAnswer(null);
    setAnswered(false);
  }, [currentIndex]);

  const lesson = ACADEMY_LESSONS[currentIndex];

  const progress = useMemo(
    () =>
      Math.round(
        (completedIds.length /
          ACADEMY_LESSONS.length) *
          100
      ),
    [completedIds]
  );

  const isCompleted = completedIds.includes(
    lesson.id
  );

  const isCorrect =
    answered &&
    selectedAnswer === lesson.answer;

  function selectLesson(index) {
    setCurrentIndex(index);

    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  }

  function checkAnswer() {
    if (selectedAnswer === null) return;

    setAnswered(true);

    if (
      selectedAnswer === lesson.answer &&
      !completedIds.includes(lesson.id)
    ) {
      setCompletedIds((current) => [
        ...current,
        lesson.id,
      ]);
    }
  }

  function goToPrevious() {
    setCurrentIndex((current) =>
      current === 0
        ? ACADEMY_LESSONS.length - 1
        : current - 1
    );
  }

  function goToNext() {
    setCurrentIndex((current) =>
      (current + 1) % ACADEMY_LESSONS.length
    );
  }

  return (
    <main className="page">
      <div className="shell">
        <nav className="topbar">
          <div className="topLinks">
            <Link
              href="/haber-merkezi"
              className="backLink"
            >
              ← Haber Merkezine Dön
            </Link>

            <Link
              href="/senkron-panel"
              className="panelLink"
            >
              Senkron Panel
            </Link>
          </div>

          <div className="dailyBadge">
            <span>●</span>
            Her gün yeni ders
          </div>
        </nav>

        <header className="hero">
          <div className="heroContent">
            <p className="eyebrow">
              SKY FİNANS • AKADEMİ
            </p>

            <h1>Her Gün Bir Adım Daha Bilinçli</h1>

            <p className="heroText">
              Bilanço, teknik analiz, makroekonomi,
              risk ve opsiyon konularını sade
              anlatımlarla öğren. Her dersi kısa bir
              testle tamamla ve ilerlemeni takip et.
            </p>

            <div className="heroActions">
              <button
                type="button"
                className="todayButton"
                onClick={() =>
                  selectLesson(todayIndex)
                }
              >
                Bugünün Dersine Git
              </button>

              <span>
                Günlük ortalama 6–8 dakika
              </span>
            </div>
          </div>

          <div className="progressCard">
            <div className="progressTop">
              <span>Akademi ilerlemen</span>
              <strong>%{progress}</strong>
            </div>

            <div className="progressTrack">
              <div
                className="progressFill"
                style={{ width: `${progress}%` }}
              />
            </div>

            <div className="progressStats">
              <div>
                <strong>{completedIds.length}</strong>
                <span>Tamamlanan</span>
              </div>

              <div>
                <strong>
                  {ACADEMY_LESSONS.length}
                </strong>
                <span>Toplam ders</span>
              </div>

              <div>
                <strong>
                  {ACADEMY_LESSONS.length -
                    completedIds.length}
                </strong>
                <span>Kalan ders</span>
              </div>
            </div>
          </div>
        </header>

        <section className="lessonHeader">
          <div>
            <div className="lessonTags">
              <span className="categoryTag">
                {lesson.category}
              </span>

              <span>{lesson.duration}</span>
              <span>{lesson.level}</span>

              {currentIndex === todayIndex ? (
                <span className="todayTag">
                  Bugünün dersi
                </span>
              ) : null}

              {isCompleted ? (
                <span className="completedTag">
                  ✓ Tamamlandı
                </span>
              ) : null}
            </div>

            <p className="lessonNumber">
              DERS{' '}
              {String(currentIndex + 1).padStart(
                2,
                '0'
              )}{' '}
              / {ACADEMY_LESSONS.length}
            </p>

            <h2>{lesson.title}</h2>
          </div>

          <div className="lessonNavigation">
            <button
              type="button"
              onClick={goToPrevious}
              aria-label="Önceki ders"
            >
              ←
            </button>

            <button
              type="button"
              onClick={goToNext}
              aria-label="Sonraki ders"
            >
              →
            </button>
          </div>
        </section>

        <section className="contentGrid">
          <article className="lessonCard">
            <section className="contentBlock">
              <p className="blockLabel">
                KONUYU ANLA
              </p>
              <h3>Kısa ve Sade Anlatım</h3>
              <p className="summary">
                {lesson.summary}
              </p>
            </section>

            <section className="contentBlock">
              <p className="blockLabel">
                AKLINDA KALSIN
              </p>
              <h3>Üç Önemli Nokta</h3>

              <div className="points">
                {lesson.points.map(
                  (point, index) => (
                    <div
                      key={point}
                      className="point"
                    >
                      <span>{index + 1}</span>
                      <p>{point}</p>
                    </div>
                  )
                )}
              </div>
            </section>

            <section className="exampleBox">
              <div className="exampleIcon">↗</div>
              <div>
                <p className="blockLabel">
                  PİYASADAN ÖRNEK
                </p>
                <p>{lesson.example}</p>
              </div>
            </section>
          </article>

          <aside className="sideColumn">
            <section className="termCard">
              <span className="termIcon">Aa</span>
              <p className="blockLabel">
                GÜNÜN FİNANS TERİMİ
              </p>
              <h3>{lesson.term}</h3>
              <p>{lesson.definition}</p>
            </section>

            <section className="dailyInfo">
              <p className="blockLabel">
                BUGÜNÜN PROGRAMI
              </p>

              <div>
                <span>Okuma</span>
                <strong>{lesson.duration}</strong>
              </div>

              <div>
                <span>Mini test</span>
                <strong>1 soru</strong>
              </div>

              <div>
                <span>Seviye</span>
                <strong>{lesson.level}</strong>
              </div>
            </section>
          </aside>
        </section>

        <section className="quizCard">
          <div className="quizHeading">
            <div>
              <p className="blockLabel">
                BİLGİNİ TEST ET
              </p>
              <h2>Günün Mini Testi</h2>
            </div>

            <span className="questionCount">
              1 / 1
            </span>
          </div>

          <p className="question">
            {lesson.question}
          </p>

          <div className="answers">
            {lesson.options.map(
              (option, index) => {
                let answerClass = 'answerButton';

                if (
                  answered &&
                  index === lesson.answer
                ) {
                  answerClass += ' correct';
                } else if (
                  answered &&
                  index === selectedAnswer
                ) {
                  answerClass += ' wrong';
                } else if (
                  selectedAnswer === index
                ) {
                  answerClass += ' selected';
                }

                return (
                  <button
                    key={option}
                    type="button"
                    className={answerClass}
                    disabled={answered}
                    onClick={() =>
                      setSelectedAnswer(index)
                    }
                  >
                    <span>
                      {String.fromCharCode(
                        65 + index
                      )}
                    </span>
                    {option}
                  </button>
                );
              }
            )}
          </div>

          {!answered ? (
            <button
              type="button"
              className="checkButton"
              disabled={selectedAnswer === null}
              onClick={checkAnswer}
            >
              Cevabı Kontrol Et
            </button>
          ) : (
            <div
              className={
                isCorrect
                  ? 'resultBox success'
                  : 'resultBox error'
              }
            >
              <strong>
                {isCorrect
                  ? '✓ Doğru cevap!'
                  : 'Tekrar gözden geçirelim'}
              </strong>

              <p>{lesson.explanation}</p>

              {!isCorrect ? (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedAnswer(null);
                    setAnswered(false);
                  }}
                >
                  Yeniden Dene
                </button>
              ) : (
                <button
                  type="button"
                  onClick={goToNext}
                >
                  Sonraki Derse Geç →
                </button>
              )}
            </div>
          )}
        </section>

        <section className="librarySection">
          <div className="sectionHeading">
            <div>
              <p className="blockLabel">
                21 GÜNLÜK PROGRAM
              </p>
              <h2>Ders Kütüphanesi</h2>
            </div>

            <span>
              İstediğin dersi tekrar okuyabilirsin
            </span>
          </div>

          <div className="lessonGrid">
            {ACADEMY_LESSONS.map(
              (libraryLesson, index) => {
                const completed =
                  completedIds.includes(
                    libraryLesson.id
                  );

                return (
                  <button
                    key={libraryLesson.id}
                    type="button"
                    className={
                      index === currentIndex
                        ? 'libraryCard active'
                        : 'libraryCard'
                    }
                    onClick={() =>
                      selectLesson(index)
                    }
                  >
                    <div className="libraryTop">
                      <span>
                        {String(index + 1).padStart(
                          2,
                          '0'
                        )}
                      </span>

                      {completed ? (
                        <strong>✓</strong>
                      ) : index === todayIndex ? (
                        <strong>Bugün</strong>
                      ) : null}
                    </div>

                    <small>
                      {libraryLesson.category}
                    </small>

                    <h3>
                      {libraryLesson.title}
                    </h3>

                    <p>
                      {libraryLesson.duration} •{' '}
                      {libraryLesson.level}
                    </p>
                  </button>
                );
              }
            )}
          </div>
        </section>

        <footer className="footer">
          <p>
            Eğitim içerikleri finansal okuryazarlık
            amacıyla hazırlanmıştır ve yatırım
            tavsiyesi değildir.
          </p>

          <Link href="/haber-merkezi">
            Güncel haberlerle devam et →
          </Link>
        </footer>
      </div>

      <style jsx>{`
        * {
          box-sizing: border-box;
        }

        :global(html),
        :global(body) {
          max-width: 100%;
          overflow-x: hidden;
        }

        .page {
          width: 100%;
          min-height: 100vh;
          overflow-x: hidden;
          padding: 24px;
          color: #f8fafc;
          background:
            radial-gradient(
              circle at 10% 0%,
              rgba(56, 189, 248, 0.12),
              transparent 30%
            ),
            radial-gradient(
              circle at 90% 10%,
              rgba(212, 175, 55, 0.13),
              transparent 30%
            ),
            #070d16;
        }

        .shell {
          width: 100%;
          max-width: 1450px;
          min-width: 0;
          margin: 0 auto;
        }

        .hero,
        .lessonHeader,
        .contentGrid,
        .lessonCard,
        .termCard,
        .dailyInfo,
        .quizCard {
          min-width: 0;
        }

        .topbar,
        .topLinks,
        .heroActions,
        .lessonTags,
        .lessonNavigation,
        .quizHeading,
        .sectionHeading,
        .footer {
          display: flex;
          align-items: center;
        }

        .topbar,
        .quizHeading,
        .sectionHeading,
        .footer {
          justify-content: space-between;
        }

        .topbar {
          gap: 18px;
          margin-bottom: 18px;
        }

        .topLinks {
          gap: 17px;
        }

        .backLink,
        .panelLink {
          color: #cbd5e1;
          font-size: 12px;
          font-weight: 850;
          text-decoration: none;
        }

        .panelLink {
          color: #718096;
        }

        .dailyBadge {
          display: flex;
          align-items: center;
          gap: 7px;
          padding: 8px 12px;
          border: 1px solid rgba(74, 222, 128, 0.23);
          border-radius: 999px;
          color: #86efac;
          background: rgba(34, 197, 94, 0.08);
          font-size: 10px;
          font-weight: 900;
        }

        .dailyBadge span {
          color: #4ade80;
          font-size: 8px;
        }

        .hero {
          display: grid;
          grid-template-columns:
            minmax(0, 1.3fr)
            minmax(320px, 0.7fr);
          gap: 30px;
          padding: 36px;
          border: 1px solid rgba(212, 175, 55, 0.28);
          border-radius: 24px;
          background:
            linear-gradient(
              135deg,
              rgba(12, 42, 51, 0.96),
              rgba(15, 23, 42, 0.98)
            );
          box-shadow: 0 24px 70px rgba(0, 0, 0, 0.3);
        }

        .eyebrow,
        .blockLabel {
          margin: 0 0 8px;
          color: #d4af37;
          font-size: 10px;
          font-weight: 950;
          letter-spacing: 1.3px;
        }

        .hero h1 {
          max-width: 850px;
          margin: 0;
          font-size: clamp(34px, 5vw, 59px);
          line-height: 1.06;
          letter-spacing: -1.8px;
        }

        .heroText {
          max-width: 750px;
          margin: 18px 0 0;
          color: #aab8ca;
          font-size: 14px;
          line-height: 1.7;
        }

        .heroActions {
          gap: 15px;
          flex-wrap: wrap;
          margin-top: 24px;
        }

        .heroActions > span {
          color: #718096;
          font-size: 10px;
        }

        .todayButton,
        .checkButton {
          min-height: 43px;
          padding: 0 17px;
          border: 0;
          border-radius: 11px;
          color: #111827;
          background:
            linear-gradient(
              135deg,
              #d4af37,
              #f0d675
            );
          font-size: 11px;
          font-weight: 950;
          cursor: pointer;
        }

        .progressCard {
          align-self: center;
          padding: 20px;
          border: 1px solid rgba(148, 163, 184, 0.15);
          border-radius: 17px;
          background: rgba(0, 0, 0, 0.2);
        }

        .progressTop {
          display: flex;
          align-items: center;
          justify-content: space-between;
          color: #94a3b8;
          font-size: 11px;
        }

        .progressTop strong {
          color: #f0d675;
          font-size: 27px;
        }

        .progressTrack {
          height: 8px;
          overflow: hidden;
          margin-top: 15px;
          border-radius: 99px;
          background: rgba(255, 255, 255, 0.07);
        }

        .progressFill {
          height: 100%;
          border-radius: inherit;
          background:
            linear-gradient(
              90deg,
              #38bdf8,
              #d4af37
            );
          transition: width 300ms ease;
        }

        .progressStats {
          display: grid;
          grid-template-columns: repeat(
            3,
            minmax(0, 1fr)
          );
          gap: 9px;
          margin-top: 17px;
        }

        .progressStats div {
          padding: 11px;
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.035);
        }

        .progressStats strong,
        .progressStats span {
          display: block;
        }

        .progressStats strong {
          color: #f8fafc;
          font-size: 17px;
        }

        .progressStats span {
          margin-top: 3px;
          color: #64748b;
          font-size: 8px;
        }

        .lessonHeader {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 20px;
          margin: 29px 2px 14px;
        }

        .lessonTags {
          gap: 7px;
          flex-wrap: wrap;
          color: #718096;
          font-size: 9px;
        }

        .lessonTags > span {
          padding: 5px 8px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.035);
        }

        .categoryTag {
          color: #7dd3fc !important;
          border: 1px solid rgba(56, 189, 248, 0.2);
          background: rgba(
            56,
            189,
            248,
            0.08
          ) !important;
        }

        .todayTag {
          color: #f0d675 !important;
        }

        .completedTag {
          color: #86efac !important;
        }

        .lessonNumber {
          margin: 15px 0 5px;
          color: #64748b;
          font-size: 9px;
          font-weight: 900;
          letter-spacing: 1px;
        }

        .lessonHeader h2 {
          max-width: 950px;
          margin: 0;
          overflow-wrap: anywhere;
          font-size: clamp(23px, 3vw, 35px);
        }

        .lessonNavigation {
          gap: 8px;
        }

        .lessonNavigation button {
          width: 42px;
          height: 42px;
          border: 1px solid rgba(212, 175, 55, 0.25);
          border-radius: 11px;
          color: #f0d675;
          background: rgba(212, 175, 55, 0.07);
          font-size: 17px;
          cursor: pointer;
        }

        .contentGrid {
          display: grid;
          grid-template-columns:
            minmax(0, 1fr)
            minmax(280px, 0.34fr);
          gap: 14px;
        }

        .lessonCard,
        .termCard,
        .dailyInfo,
        .quizCard {
          border: 1px solid rgba(148, 163, 184, 0.14);
          border-radius: 18px;
          background:
            linear-gradient(
              145deg,
              rgba(18, 29, 43, 0.96),
              rgba(13, 20, 32, 0.96)
            );
        }

        .lessonCard {
          padding: 24px;
        }

        .contentBlock + .contentBlock {
          margin-top: 28px;
          padding-top: 25px;
          border-top: 1px solid rgba(148, 163, 184, 0.1);
        }

        .contentBlock h3,
        .termCard h3 {
          margin: 0;
          font-size: 20px;
        }

        .summary {
          margin: 13px 0 0;
          color: #b7c3d4;
          font-size: 13px;
          line-height: 1.8;
        }

        .points {
          display: grid;
          grid-template-columns: repeat(
            3,
            minmax(0, 1fr)
          );
          gap: 10px;
          margin-top: 14px;
        }

        .point {
          display: flex;
          gap: 10px;
          padding: 13px;
          border-radius: 11px;
          color: #aab8ca;
          background: rgba(255, 255, 255, 0.03);
          font-size: 11px;
          line-height: 1.55;
        }

        .point > span {
          display: grid;
          place-items: center;
          flex: 0 0 25px;
          width: 25px;
          height: 25px;
          border-radius: 50%;
          color: #111827;
          background: #d4af37;
          font-size: 9px;
          font-weight: 950;
        }

        .point p {
          margin: 2px 0 0;
        }

        .exampleBox {
          display: flex;
          gap: 14px;
          margin-top: 25px;
          padding: 17px;
          border-left: 3px solid #38bdf8;
          border-radius: 0 12px 12px 0;
          color: #aab8ca;
          background: rgba(56, 189, 248, 0.06);
          font-size: 11px;
          line-height: 1.6;
        }

        .exampleIcon {
          color: #7dd3fc;
          font-size: 22px;
        }

        .exampleBox p {
          margin: 0;
        }

        .sideColumn {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .termCard,
        .dailyInfo {
          padding: 20px;
        }

        .termIcon {
          display: grid;
          place-items: center;
          width: 42px;
          height: 42px;
          margin-bottom: 18px;
          border-radius: 12px;
          color: #111827;
          background:
            linear-gradient(
              135deg,
              #38bdf8,
              #7dd3fc
            );
          font-size: 14px;
          font-weight: 950;
        }

        .termCard p:last-child {
          margin: 12px 0 0;
          color: #94a3b8;
          font-size: 11px;
          line-height: 1.65;
        }

        .dailyInfo div {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 11px 0;
          border-bottom: 1px solid rgba(148, 163, 184, 0.1);
          color: #718096;
          font-size: 10px;
        }

        .dailyInfo div:last-child {
          border-bottom: 0;
        }

        .dailyInfo strong {
          color: #f8fafc;
        }

        .quizCard {
          margin-top: 15px;
          padding: 24px;
        }

        .quizHeading {
          gap: 15px;
        }

        .quizHeading h2,
        .sectionHeading h2 {
          margin: 0;
          font-size: 23px;
        }

        .questionCount {
          color: #64748b;
          font-size: 10px;
        }

        .question {
          margin: 22px 0 15px;
          color: #f8fafc;
          font-size: 17px;
          font-weight: 800;
          line-height: 1.5;
        }

        .answers {
          display: grid;
          grid-template-columns: repeat(
            3,
            minmax(0, 1fr)
          );
          gap: 10px;
        }

        .answerButton {
          display: flex;
          align-items: center;
          gap: 11px;
          min-height: 56px;
          padding: 10px 13px;
          border: 1px solid rgba(148, 163, 184, 0.16);
          border-radius: 11px;
          color: #cbd5e1;
          background: rgba(255, 255, 255, 0.025);
          text-align: left;
          cursor: pointer;
        }

        .answerButton > span {
          display: grid;
          place-items: center;
          flex: 0 0 28px;
          width: 28px;
          height: 28px;
          border-radius: 8px;
          color: #94a3b8;
          background: rgba(255, 255, 255, 0.06);
          font-size: 10px;
          font-weight: 950;
        }

        .answerButton.selected {
          border-color: rgba(212, 175, 55, 0.5);
          color: #f0d675;
          background: rgba(212, 175, 55, 0.09);
        }

        .answerButton.correct {
          border-color: rgba(74, 222, 128, 0.45);
          color: #bbf7d0;
          background: rgba(34, 197, 94, 0.1);
        }

        .answerButton.wrong {
          border-color: rgba(248, 113, 113, 0.45);
          color: #fecaca;
          background: rgba(239, 68, 68, 0.1);
        }

        .checkButton {
          margin-top: 15px;
        }

        .checkButton:disabled {
          cursor: not-allowed;
          opacity: 0.45;
        }

        .resultBox {
          margin-top: 15px;
          padding: 15px;
          border-radius: 11px;
        }

        .resultBox.success {
          color: #bbf7d0;
          background: rgba(34, 197, 94, 0.09);
          border: 1px solid rgba(34, 197, 94, 0.23);
        }

        .resultBox.error {
          color: #fecaca;
          background: rgba(239, 68, 68, 0.09);
          border: 1px solid rgba(239, 68, 68, 0.23);
        }

        .resultBox p {
          margin: 7px 0 0;
          font-size: 11px;
          line-height: 1.55;
        }

        .resultBox button {
          margin-top: 11px;
          padding: 8px 12px;
          border: 0;
          border-radius: 8px;
          color: #111827;
          background: #f8fafc;
          font-size: 9px;
          font-weight: 900;
          cursor: pointer;
        }

        .librarySection {
          margin-top: 34px;
        }

        .sectionHeading {
          gap: 20px;
          margin-bottom: 14px;
        }

        .sectionHeading > span {
          color: #64748b;
          font-size: 10px;
        }

        .lessonGrid {
          display: grid;
          grid-template-columns: repeat(
            3,
            minmax(0, 1fr)
          );
          gap: 10px;
        }

        .libraryCard {
          min-height: 155px;
          padding: 15px;
          border: 1px solid rgba(148, 163, 184, 0.13);
          border-radius: 14px;
          color: #f8fafc;
          background: rgba(15, 23, 42, 0.76);
          text-align: left;
          cursor: pointer;
          transition:
            transform 160ms ease,
            border-color 160ms ease;
        }

        .libraryCard:hover {
          transform: translateY(-3px);
          border-color: rgba(212, 175, 55, 0.38);
        }

        .libraryCard.active {
          border-color: rgba(212, 175, 55, 0.55);
          background: rgba(212, 175, 55, 0.08);
        }

        .libraryTop {
          display: flex;
          align-items: center;
          justify-content: space-between;
          color: #64748b;
          font-size: 9px;
        }

        .libraryTop strong {
          color: #86efac;
          font-size: 9px;
        }

        .libraryCard small {
          display: block;
          margin-top: 13px;
          color: #d4af37;
          font-size: 8px;
          font-weight: 950;
          text-transform: uppercase;
        }

        .libraryCard h3 {
          margin: 7px 0 0;
          font-size: 13px;
          line-height: 1.45;
        }

        .libraryCard p {
          margin: 12px 0 0;
          color: #64748b;
          font-size: 9px;
        }

        .footer {
          gap: 20px;
          margin-top: 35px;
          padding: 19px 2px;
          border-top: 1px solid rgba(148, 163, 184, 0.12);
          color: #526076;
          font-size: 10px;
        }

        .footer p {
          margin: 0;
        }

        .footer a {
          color: #f0d675;
          font-weight: 900;
          text-decoration: none;
        }

        @media (max-width: 1000px) {
          .hero,
          .contentGrid {
            grid-template-columns: 1fr;
          }

          .lessonGrid {
            grid-template-columns: repeat(
              2,
              minmax(0, 1fr)
            );
          }
        }

        @media (max-width: 720px) {
          .page {
            padding: 12px;
          }

          .topbar,
          .lessonHeader,
          .sectionHeading,
          .footer {
            align-items: flex-start;
            flex-direction: column;
          }

          .hero {
            padding: 24px 18px;
          }

          .progressStats,
          .points,
          .answers,
          .lessonGrid {
            grid-template-columns: 1fr;
          }

          .lessonCard,
          .quizCard {
            padding: 18px;
          }

          .lessonNavigation {
            align-self: flex-end;
          }
        }
      `}</style>
    </main>
  );
}
