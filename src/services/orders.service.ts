import {
  collection, doc, addDoc, updateDoc, getDoc, getDocs,
  query, where, orderBy, serverTimestamp, writeBatch, Firestore,
} from 'firebase/firestore';
import type { Order, OrderCustomer, OrderProduct, OrderShipping } from '@/types';

export function getOrdersRef(db: Firestore) {
  return collection(db, 'orders');
}

export function getOrderRef(db: Firestore, orderId: string) {
  return doc(db, 'orders', orderId);
}

export function getOrderSubcollectionRef(
  db: Firestore,
  orderId: string,
  subcollection: 'customer' | 'representative' | 'doctor' | 'products' | 'shipping' | 'documents' | 'documentRequests' | 'payments' | 'paymentLinks'
) {
  return collection(db, 'orders', orderId, subcollection);
}

// TODO: Implement complex order creation with batch writes
