import {
  collection, doc, addDoc, updateDoc, getDoc, getDocs,
  query, where, serverTimestamp, Firestore,
} from 'firebase/firestore';
import type { Payment, PaymentLink } from '@/types';

export function getOrderPaymentsRef(db: Firestore, orderId: string) {
  return collection(db, 'orders', orderId, 'payments');
}

export function getOrderPaymentLinksRef(db: Firestore, orderId: string) {
  return collection(db, 'orders', orderId, 'paymentLinks');
}

// TODO: Implement payment operations
