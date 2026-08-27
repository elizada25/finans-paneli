import { NextResponse } from 'next/server';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const VERSION = 'firestore-protected-export-v1';
const MAX_DOCUMENTS = 20000;
const EXCLUDED_COLLECTIONS = new Set([
  'notificationDevices',
  'alertHistory',
  'newsAlertHistory',
  'smartAlertHistory',
]);

function getAdminApp() {
  if (getApps().length) return getApps()[0];

  const encoded = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;

  if (!encoded) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_BASE64 eksik.');
  }

  const serviceAccount = JSON.parse(
    Buffer.from(encoded, 'base64').toString('utf8')
  );

  return initializeApp({
    credential: cert(serviceAccount),
  });
}

function serialize(value) {
  if (value === null || value === undefined) return value ?? null;

  if (Array.isArray(value)) {
    return value.map(serialize);
  }

  if (Buffer.isBuffer(value)) {
    return {
      __firestoreType: 'bytes',
      value: value.toString('base64'),
    };
  }

  if (typeof value === 'object') {
    if (typeof value.toDate === 'function') {
      return {
        __firestoreType: 'timestamp',
        value: value.toDate().toISOString(),
      };
    }

    if (
      Number.isFinite(value.latitude) &&
      Number.isFinite(value.longitude)
    ) {
      return {
        __firestoreType: 'geopoint',
        latitude: value.latitude,
        longitude: value.longitude,
      };
    }

    if (typeof value.path === 'string' && value.firestore) {
      return {
        __firestoreType: 'reference',
        path: value.path,
      };
    }

    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, serialize(item)])
    );
  }

  return value;
}

async function collectDocument(documentRef, documents, stats) {
  if (documents.length >= MAX_DOCUMENTS) {
    throw new Error(`Belge sınırı aşıldı: ${MAX_DOCUMENTS}`);
  }

  const snapshot = await documentRef.get();

  if (snapshot.exists) {
    documents.push({
      path: documentRef.path,
      data: serialize(snapshot.data()),
    });
  }

  const collections = await documentRef.listCollections();

  for (const collectionRef of collections) {
    if (EXCLUDED_COLLECTIONS.has(collectionRef.id)) {
      stats.excludedCollections.add(collectionRef.id);
      continue;
    }

    const childSnapshot = await collectionRef.get();

    for (const childDocument of childSnapshot.docs) {
      await collectDocument(childDocument.ref, documents, stats);
    }
  }
}

export async function GET(request) {
  try {
    const expected = process.env.ALERT_CRON_SECRET;
    const authorization = request.headers.get('authorization');

    if (!expected || authorization !== `Bearer ${expected}`) {
      return NextResponse.json(
        { error: 'Yetkisiz erişim.' },
        { status: 401 }
      );
    }

    getAdminApp();
    const db = getFirestore();
    const usersSnapshot = await db.collection('users').get();
    const documents = [];
    const stats = { excludedCollections: new Set() };

    for (const userDocument of usersSnapshot.docs) {
      await collectDocument(userDocument.ref, documents, stats);
    }

    const createdAt = new Date().toISOString();
    const dateKey = createdAt.slice(0, 10);
    const body = {
      ok: true,
      version: VERSION,
      createdAt,
      firebaseProject:
        process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || null,
      userCount: usersSnapshot.size,
      documentCount: documents.length,
      excludedCollections: [...stats.excludedCollections].sort(),
      documents,
    };

    return new NextResponse(JSON.stringify(body), {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'content-disposition':
          `attachment; filename="finans-paneli-veri-yedegi-${dateKey}.json"`,
        'cache-control': 'no-store, max-age=0',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('Veri yedekleme hatası:', error);

    return NextResponse.json(
      {
        ok: false,
        error: error?.message || 'Veri yedeği oluşturulamadı.',
      },
      { status: 500 }
    );
  }
}
