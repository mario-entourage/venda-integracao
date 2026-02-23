import { Timestamp } from 'firebase/firestore';

export interface Product {
  id: string;
  name: string;
  description?: string;
  sku: string;
  hsCode: string;
  concentration?: string;
  price: number;
  inventory?: number;
  active: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  removedAt?: Timestamp;
}

export interface Stock {
  id: string;
  code: number;
  name: string;
  description?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface StockProduct {
  id: string;
  quantity: number;
  stockId: string;
  productId: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
