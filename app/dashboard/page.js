export default function DashboardPage() {
  return (
    <main style={{ width: '100%', height: '100vh', background: '#080d18', position: 'relative' }}>
      <form action="/api/logout" method="post" style={{ position: 'fixed', right: 14, bottom: 14, zIndex: 9999 }}>
        <button type="submit" style={{ border: '1px solid #33466f', borderRadius: 9, padding: '9px 13px', background: '#121b30', color: '#e6edf7', cursor: 'pointer', boxShadow: '0 5px 20px rgba(0,0,0,.35)' }}>Çıkış</button>
      </form>
      <iframe
        src="/panel.html"
        title="Finans Takip Paneli"
        style={{ width: '100%', height: '100%', border: 0, display: 'block' }}
      />
    </main>
  );
}
