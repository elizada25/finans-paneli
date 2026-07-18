export const metadata = {
  title: {
    default: 'SKY FİNANS',
    template: '%s | SKY FİNANS',
  },
  description:
    'Kişisel ve güvenli yatırım takip uygulaması',
  applicationName: 'SKY FİNANS',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'SKY FİNANS',
  },
  icons: {
    icon: [
      {
        url: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        url: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
    apple: [
      {
        url: '/apple-icon.png',
        sizes: '180x180',
        type: 'image/png',
      },
    ],
  },
};

export const viewport = {
  themeColor: '#07111f',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}) {
  return (
    <html lang="tr">
      <body
        style={{
          margin: 0,
          background: '#080d18',
          fontFamily:
            'Arial, Helvetica, sans-serif',
          WebkitFontSmoothing:
            'antialiased',
        }}
      >
        {children}
      </body>
    </html>
  );
}