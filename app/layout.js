export const metadata = {
  title: 'Finans Takip Paneli',
  description: 'Kişisel ve güvenli finans takip paneli'
};

export default function RootLayout({ children }) {
  return (
    <html lang="tr">
      <body style={{ margin: 0, background: '#080d18', fontFamily: 'Arial, sans-serif' }}>
        {children}
      </body>
    </html>
  );
}
