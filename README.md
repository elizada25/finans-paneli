# Finans Paneli Pro

Bu sürüm, mevcut finans panelini Vercel üzerinde çalışan şifreli bir Next.js web uygulamasına dönüştürür.

## Vercel Environment Variables

Vercel > Project > Settings > Environment Variables bölümüne şunları ekleyin:

- `APP_USERNAME` = giriş kullanıcı adınız (örnek: elizada25)
- `APP_PASSWORD` = güçlü bir şifre
- `AUTH_SECRET` = en az 32 karakterlik rastgele gizli metin

Örnek AUTH_SECRET:
`ElizFinans-2026-cok-uzun-gizli-anahtar-92841`

Değişkenleri ekledikten sonra Deployments > Redeploy yapın.

## Önemli

- Şifre kaynak kodunda tutulmaz.
- Oturum HTTP-only ve imzalı çerezle korunur.
- Mevcut portföy kayıtları hâlâ cihazın localStorage alanında tutulur. Telefon ve bilgisayar senkronizasyonu için sonraki aşamada Supabase eklenebilir.
