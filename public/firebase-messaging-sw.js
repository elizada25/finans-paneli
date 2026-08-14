/* Sky Finans Firebase Messaging Service Worker */

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

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl =
    event.notification?.data?.url ||
    "/senkron-panel";

  event.waitUntil(
    clients
      .matchAll({
        type: "window",
        includeUncontrolled: true
      })
      .then((windowClients) => {
        for (const client of windowClients) {
          if ("navigate" in client) {
            client.navigate(targetUrl);
          }

          if ("focus" in client) {
            return client.focus();
          }
        }

        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }

        return null;
      })
  );
});
