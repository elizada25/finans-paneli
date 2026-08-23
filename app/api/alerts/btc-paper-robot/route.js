
import { NextResponse } from "next/server";
import {
  cert,
  getApps,
  initializeApp,
} from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { analyzeBtc } from "../../btc-strategy";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function getAdminApp() {
  if (getApps().length) return getApps()[0];

  const encoded =
    process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;

  if (!encoded) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT_BASE64 eksik."
    );
  }

  return initializeApp({
    credential: cert(
      JSON.parse(
        Buffer.from(
          encoded,
          "base64"
        ).toString("utf8")
      )
    ),
  });
}

function round(value, digits = 2) {
  return Number(Number(value).toFixed(digits));
}

async function sendNotification({
  userRef,
  messaging,
  title,
  body,
}) {
  const devices = await userRef
    .collection("notificationDevices")
    .where("enabled", "==", true)
    .get();

  const tokens = [
    ...new Set(
      devices.docs
        .map((item) => item.data()?.token)
        .filter(Boolean)
    ),
  ].slice(0, 500);

  if (!tokens.length) return 0;

  const baseUrl =
    process.env.APP_URL ||
    "https://finans-paneli-amber.vercel.app";

  const link = `${baseUrl}/senkron-panel`;

  const result =
    await messaging.sendEachForMulticast({
      tokens,
      notification: {
        title,
        body,
      },
      data: {
        type: "btc-paper-robot",
        url: link,
        symbol: "BTCUSDT",
      },
      webpush: {
        fcmOptions: {
          link,
        },
        notification: {
          icon: "/icon-192.png",
          badge: "/icon-192.png",
          tag: "btc-paper-robot",
        },
      },
    });

  return result.successCount;
}

export async function GET(request) {
  try {
    const expected =
      process.env.ALERT_CRON_SECRET;

    if (
      !expected ||
      request.headers.get("authorization") !==
        `Bearer ${expected}`
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: "Yetkisiz erişim.",
        },
        { status: 401 }
      );
    }

    getAdminApp();

    const db = getFirestore();
    const messaging = getMessaging();
    const analysis = await analyzeBtc();
    const users = await db.collection("users").get();

    let activeRobots = 0;
    let opened = 0;
    let closed = 0;
    let sent = 0;

    for (const user of users.docs) {
      const userRef = user.ref;
      const configRef = userRef
        .collection("btcRobot")
        .doc("config");

      const configSnapshot =
        await configRef.get();

      if (!configSnapshot.exists) continue;

      const config = configSnapshot.data();

      if (config?.enabled !== true) continue;

      activeRobots += 1;

      const balance =
        Number(config.balance) ||
        Number(config.startingCapital) ||
        10000;

      const riskPercent = Math.min(
        2,
        Math.max(
          0.25,
          Number(config.riskPercent) || 1
        )
      );

      const openPositions = await userRef
        .collection("btcTrades")
        .where("status", "==", "open")
        .limit(1)
        .get();

      const openTrade =
        openPositions.empty
          ? null
          : {
              id: openPositions.docs[0].id,
              ...openPositions.docs[0].data(),
            };

      if (openTrade) {
        const entry = Number(openTrade.entry);
        const quantity = Number(openTrade.quantity);
        const stop = Number(openTrade.stop);
        const target2 = Number(openTrade.target2);
        const price = Number(analysis.price);

        let exitReason = "";

        if (price <= stop) {
          exitReason = "Zarar-kes";
        } else if (price >= target2) {
          exitReason = "Hedef 2";
        } else if (analysis.signal === "ÇIKIŞ") {
          exitReason = "Teknik çıkış";
        }

        if (exitReason) {
          const grossPnl =
            (price - entry) * quantity;

          const fees =
            (entry * quantity + price * quantity) *
            0.001;

          const pnl = grossPnl - fees;
          const newBalance = balance + pnl;

          await userRef
            .collection("btcTrades")
            .doc(openTrade.id)
            .update({
              status: "closed",
              exit: round(price),
              exitReason,
              pnl: round(pnl),
              closedAt:
                new Date().toISOString(),
            });

          await configRef.set(
            {
              balance: round(newBalance),
              updatedAt:
                new Date().toISOString(),
            },
            { merge: true }
          );

          sent += await sendNotification({
            userRef,
            messaging,
            title: "₿ BTC sanal işlemi kapandı",
            body:
              `${exitReason} • Çıkış: $${round(price)} • ` +
              `Sonuç: ${pnl >= 0 ? "+" : ""}$${round(pnl)}`,
          });

          closed += 1;
        }

        continue;
      }

      if (
        analysis.signal !== "AL" ||
        config.lastEntryCandle ===
          analysis.candleTime
      ) {
        continue;
      }

      const entry = Number(analysis.price);
      const stop = Number(analysis.stop);
      const riskPerBtc = entry - stop;
      const riskAmount =
        balance * (riskPercent / 100);

      if (
        riskPerBtc <= 0 ||
        riskAmount <= 0
      ) {
        continue;
      }

      const riskQuantity =
        riskAmount / riskPerBtc;

      const maximumQuantity =
        balance / entry;

      const quantity = Math.min(
        riskQuantity,
        maximumQuantity
      );

      const tradeRef = userRef
        .collection("btcTrades")
        .doc();

      await tradeRef.set({
        symbol: "BTCUSDT",
        status: "open",
        side: "long",
        entry: round(entry),
        quantity: Number(
          quantity.toFixed(8)
        ),
        stop: analysis.stop,
        target1: analysis.target1,
        target2: analysis.target2,
        score: analysis.score,
        reasons: analysis.reasons,
        candleTime: analysis.candleTime,
        openedAt:
          new Date().toISOString(),
      });

      await configRef.set(
        {
          lastEntryCandle:
            analysis.candleTime,
          updatedAt:
            new Date().toISOString(),
        },
        { merge: true }
      );

      sent += await sendNotification({
        userRef,
        messaging,
        title: "₿ BTC sanal AL sinyali",
        body:
          `Puan: ${analysis.score} • Giriş: $${analysis.price} • ` +
          `Stop: $${analysis.stop} • Hedef: $${analysis.target1}`,
      });

      opened += 1;
    }

    return NextResponse.json({
      ok: true,
      signal: analysis.signal,
      score: analysis.score,
      price: analysis.price,
      activeRobots,
      opened,
      closed,
      sent,
      generatedAt:
        new Date().toISOString(),
    });
  } catch (error) {
    console.error(
      "BTC sanal robot hatası:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          error?.message ||
          "BTC robotu çalıştırılamadı.",
      },
      { status: 500 }
    );
  }
}
