import {
  collection, doc, addDoc, updateDoc, getDoc, getDocs,
  query, where, serverTimestamp, Firestore,
} from 'firebase/firestore';
import type { DocumentRecord } from '@/types';

export function getDocumentsRef(db: Firestore) {
  return collection(db, 'documents');
}

export function getDocumentRef(db: Firestore, docId: string) {
  return doc(db, 'documents', docId);
}

// TODO: Implement document upload + Firestore record creation
