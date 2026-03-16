/**
 * Mock type definitions for Product.
 *
 * REPLACE LATER: swap this with your Firestore product document type,
 * or your ORM model (e.g. Prisma Product).
 */

export interface MockProduct {
  id: string;
  name: string;
  price: number; // in cents (e.g. 1000 = R$10,00)
  stock: number;
}
