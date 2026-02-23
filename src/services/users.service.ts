import {
  collection, doc, addDoc, updateDoc, getDoc, getDocs,
  query, where, serverTimestamp, Firestore,
} from 'firebase/firestore';
import type { User, UserProfile, UserAddress } from '@/types';

export function getUsersRef(db: Firestore) {
  return collection(db, 'users');
}

export function getUserRef(db: Firestore, userId: string) {
  return doc(db, 'users', userId);
}

export function getUserProfilesRef(db: Firestore, userId: string) {
  return collection(db, 'users', userId, 'profiles');
}

export function getUserAddressesRef(db: Firestore, userId: string) {
  return collection(db, 'users', userId, 'addresses');
}

// TODO: Implement CRUD operations
