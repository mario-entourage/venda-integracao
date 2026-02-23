import {
  collection, doc, addDoc, updateDoc, getDoc, getDocs,
  query, where, serverTimestamp, Firestore,
} from 'firebase/firestore';
import type { Product, Stock, StockProduct } from '@/types';

export function getProductsRef(db: Firestore) {
  return collection(db, 'products');
}

export function getProductRef(db: Firestore, productId: string) {
  return doc(db, 'products', productId);
}

export function getStocksRef(db: Firestore) {
  return collection(db, 'stocks');
}

export function getStockProductsRef(db: Firestore) {
  return collection(db, 'stockProducts');
}

// TODO: Implement CRUD operations
