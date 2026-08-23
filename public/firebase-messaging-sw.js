/* Sky Finans Firebase Messaging Service Worker */

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.stopImmediatePropagation();
  const d = event.notification?.data || {};
  const f = d.FCM_MSG || {};
  const fd = f.data || {};
  const fo = f.fcmOptions || f.fcm_options || {};
  const raw = d.url || d.newsUrl || fd.url || fd.newsUrl || fo.link || "/senkron-panel";
  let targetUrl;
  try {
    const parsed = new URL(raw, self.location.origin);
    targetUrl = ["http:", "https:"].includes(parsed.protocol) ? parsed.href : `${self.location.origin}/senkron-panel`;
  } catch {
    targetUrl = `${self.location.origin}/senkron-panel`;
  }
  event.waitUntil((async () => {
    if (new URL(targetUrl).origin !== self.location.origin) {
      return clients.openWindow ? clients.openWindow(targetUrl) : null;
    }
    const list = await clients.matchAll({type:"window", includeUncontrolled:true});
    for (const client of list) {
      try {
        const next = "navigate" in client ? await client.navigate(targetUrl) : client;
        if (next && "focus" in next) await next.focus();
        else if ("focus" in client) await client.focus();
        return next;
      } catch {}
    }
    return clients.openWindow ? clients.openWindow(targetUrl) : null;
  })());
});

importScripts(
  "https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js"
);

importScripts(
  "https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js"
);

firebase.initializeApp({
  apiKey: "AIzaSyCgzga9FJJkeHuzbx-KWDI7y5wwxuJEDzI",
  authDomain: "eliz-finans-paneli.firebaseapp.com",
  projectId: "eliz-finans-paneli",
  storageBucket: "eliz-finans-paneli.firebasestorage.app",
  messagingSenderId: "919850426247",
  appId: "1:919850426247:web:5ddb40eac82f8a47e23d22"
});

const messaging = firebase.messaging();

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

messaging.onBackgroundMessage((payload) => {
  // Bildirim başlığı/gövdesi varsa Firebase bunu zaten otomatik gösterir.
  // İkinci kez showNotification çağırmak aynı bildirimi çoğaltır.
  if (payload?.notification) {
    return;
  }

  const title =
    payload?.data?.title ||
    "Sky Finans";

  const options = {
    body:
      payload?.data?.body ||
      "Yeni bir bildiriminiz var.",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: {
      url: payload?.data?.url || "/senkron-panel"
    }
  };

  self.registration.showNotification(title, options);
});
