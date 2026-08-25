'use client';

export default function MobileLayoutStyles() {
  return (
    <style jsx global>{`
      @media (max-width: 760px) {
        html,
        body {
          width: 100%;
          max-width: 100%;
          overflow-x: hidden;
        }

        body {
          padding-bottom:
            calc(78px + env(safe-area-inset-bottom));
        }

        main {
          width: 100% !important;
          max-width: 100% !important;
          padding-left: 10px !important;
          padding-right: 10px !important;
          box-sizing: border-box !important;
          overflow-x: hidden !important;
        }

        main > header {
          width: 100% !important;
          max-width: 100% !important;
          align-items: flex-start !important;
          gap: 14px !important;
          margin-bottom: 16px !important;
          box-sizing: border-box !important;
        }

        main > header h1 {
          font-size: 31px !important;
          line-height: 1.08 !important;
        }

        main > header p {
          font-size: 14px !important;
        }

        nav[aria-label="Panel bölümleri"] {
          position: fixed !important;
          left: 8px !important;
          right: 8px !important;
          bottom:
            calc(7px + env(safe-area-inset-bottom)) !important;
          z-index: 999990 !important;
          width: auto !important;
          max-width: none !important;
          min-height: 58px !important;
          margin: 0 !important;
          padding: 7px !important;
          display: flex !important;
          flex-wrap: nowrap !important;
          gap: 6px !important;
          overflow-x: auto !important;
          overflow-y: hidden !important;
          border-color:
            rgba(56, 189, 248, 0.34) !important;
          border-radius: 15px !important;
          background:
            rgba(7, 13, 22, 0.97) !important;
          box-shadow:
            0 -8px 28px rgba(0, 0, 0, 0.48) !important;
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          scrollbar-width: none;
        }

        nav[aria-label="Panel bölümleri"]::-webkit-scrollbar {
          display: none;
        }

        nav[aria-label="Panel bölümleri"] button {
          min-width: max-content !important;
          min-height: 44px !important;
          padding: 0 13px !important;
          flex: 0 0 auto !important;
          border-radius: 10px !important;
          font-size: 12px !important;
          line-height: 1 !important;
          touch-action: manipulation;
        }

        section,
        article {
          width: 100% !important;
          max-width: 100% !important;
          min-width: 0 !important;
          box-sizing: border-box !important;
        }

        section h2,
        article h2 {
          font-size: 23px !important;
          line-height: 1.15 !important;
        }

        section h3,
        article h3 {
          font-size: 19px !important;
          line-height: 1.2 !important;
        }

        input,
        select,
        textarea {
          max-width: 100% !important;
          box-sizing: border-box !important;
          font-size: 16px !important;
        }

        button {
          touch-action: manipulation;
        }

        table {
          font-size: 12px !important;
        }

        th,
        td {
          padding: 8px 6px !important;
        }

        .btcCenter,
        .sky-own-chart {
          width: 100% !important;
          max-width: 100% !important;
          overflow-x: hidden !important;
        }

        .btcCenter .cards,
        .btcCenter .grid {
          grid-template-columns:
            repeat(2, minmax(0, 1fr)) !important;
          gap: 8px !important;
        }

        .btcCenter .card,
        .btcCenter .panel {
          min-width: 0 !important;
          padding: 12px !important;
        }

        .btcCenter .card strong {
          font-size: 18px !important;
        }
      }

      @media (max-width: 430px) {
        main {
          padding-left: 7px !important;
          padding-right: 7px !important;
        }

        main > header h1 {
          font-size: 27px !important;
        }

        nav[aria-label="Panel bölümleri"] {
          left: 5px !important;
          right: 5px !important;
          padding: 6px !important;
        }

        nav[aria-label="Panel bölümleri"] button {
          min-height: 42px !important;
          padding: 0 11px !important;
          font-size: 11px !important;
        }

        .btcCenter .cards,
        .btcCenter .grid {
          grid-template-columns:
            repeat(2, minmax(0, 1fr)) !important;
        }

        .btcCenter .card strong {
          font-size: 16px !important;
        }
      }
    `}</style>
  );
}
