/**
 * Static product catalog for Entourage Phytolab.
 *
 * This is the single source of truth for the product lineup.
 * Products are seeded to Firestore via `POST /api/admin/seed-products`
 * and can only be changed by admins in the /estoque page or by
 * developers updating this file + re-seeding.
 *
 * price = 0 means "not yet decided" — the product will still appear
 * in the catalog but cannot be sold until a price is set.
 */

export interface CatalogProduct {
  name: string;
  sku: string;
  hsCode: string;
  concentration: string;
  price: number;
  description: string;
}

export const PRODUCTS_CATALOG: CatalogProduct[] = [
  {
    name: 'ENTOURAGE LIQUID FUSIONNER 7000+MG/60ml',
    sku: 'ELF-7000-60ML',
    hsCode: '3004.90',
    concentration: '7000+mg/60ml',
    price: 199.99,
    description: 'Entourage Liquid Fusionner — 60 ml bottle, 7000+ mg',
  },
  {
    name: 'ENTOURAGE LIQUID FUSIONNER 3500+MG/60ml',
    sku: 'ELF-3500-60ML',
    hsCode: '3004.90',
    concentration: '3500+mg/60ml',
    price: 139.99,
    description: 'Entourage Liquid Fusionner — 60 ml bottle, 3500+ mg',
  },
  {
    name: 'ENTOURAGE LIQUID FUSIONNER 5400+MG/60ml',
    sku: 'ELF-5400-60ML',
    hsCode: '3004.90',
    concentration: '5400+mg/60ml',
    price: 149.99,
    description: 'Entourage Liquid Fusionner — 60 ml bottle, 5400+ mg',
  },
  {
    name: 'ENTOURAGE LIQUID FUSIONNER 1750+MG/30ml',
    sku: 'ELF-1750-30ML',
    hsCode: '3004.90',
    concentration: '1750+mg/30ml',
    price: 0,
    description: 'Entourage Liquid Fusionner — 30 ml bottle, 1750+ mg (price TBD)',
  },
  {
    name: 'ENTOURAGE LIQUID FUSIONNER 2700+MG/30ml',
    sku: 'ELF-2700-30ML',
    hsCode: '3004.90',
    concentration: '2700+mg/30ml',
    price: 0,
    description: 'Entourage Liquid Fusionner — 30 ml bottle, 2700+ mg (price TBD)',
  },
  {
    name: 'ENTOURAGE LIQUID FUSIONNER 4500+MG/30ml',
    sku: 'ELF-4500-30ML',
    hsCode: '3004.90',
    concentration: '4500+mg/30ml',
    price: 0,
    description: 'Entourage Liquid Fusionner — 30 ml bottle, 4500+ mg (price TBD)',
  },
  {
    name: 'THC Oral Strip - 10mg',
    sku: 'TOS-10MG',
    hsCode: '3004.90',
    concentration: '10mg',
    price: 99.99,
    description: 'THC Oral Strip — 10 mg per strip',
  },
];
