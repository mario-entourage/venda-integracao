import { NextResponse } from 'next/server';
import { initializeApp, getApps, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { PRODUCTS_CATALOG } from '@/data/products-catalog';

export const dynamic = 'force-dynamic';

/**
 * GET & POST /api/admin/seed-products
 *
 * Seeds the Firestore `products` collection with the static product catalog.
 * Skips any product whose SKU already exists in the collection to avoid
 * duplicates. Safe to call multiple times.
 *
 * GET is provided so you can simply visit the URL in a browser to trigger it.
 *
 * Uses Firebase Admin SDK with Application Default Credentials (works
 * automatically on App Hosting / Cloud Run with the default service account).
 */
async function seedProducts() {
  try {
    // Initialize Admin SDK (reuse existing app if already initialized)
    if (getApps().length === 0) {
      initializeApp({
        credential: applicationDefault(),
        projectId: process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GCLOUD_PROJECT ?? 'simple-login-fdcf7',
      });
    }

    const db = getFirestore();
    const productsRef = db.collection('products');

    // Fetch existing SKUs to avoid duplicates
    const existingSnap = await productsRef.get();
    const existingSKUs = new Set(
      existingSnap.docs.map((doc) => doc.data().sku as string),
    );

    const now = new Date();
    let created = 0;
    let skipped = 0;

    for (const product of PRODUCTS_CATALOG) {
      if (existingSKUs.has(product.sku)) {
        skipped++;
        continue;
      }

      await productsRef.add({
        name: product.name,
        description: product.description,
        sku: product.sku,
        hsCode: product.hsCode,
        concentration: product.concentration,
        price: product.price,
        inventory: 0,
        active: true,
        createdAt: now,
        updatedAt: now,
      });
      created++;
    }

    return NextResponse.json({
      ok: true,
      created,
      skipped,
      total: PRODUCTS_CATALOG.length,
      message: `Seeded ${created} products (${skipped} already existed).`,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Seed products error:', msg, error);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function GET() {
  return seedProducts();
}

export async function POST() {
  return seedProducts();
}
