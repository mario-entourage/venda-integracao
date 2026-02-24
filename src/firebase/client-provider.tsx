'use client';

import React, { useMemo, useState, useEffect, type ReactNode } from 'react';
import { FirebaseContext, FirebaseProvider, type FirebaseContextState } from '@/firebase/provider';
import { initializeFirebase } from '@/firebase';

interface FirebaseClientProviderProps {
  children: ReactNode;
}

// Provided to all hooks before Firebase finishes initializing.
// isUserLoading:true causes AuthGuard to show a skeleton instead of
// rendering child pages (which would call useFirestore() with no db).
const LOADING_CONTEXT: FirebaseContextState = {
  areServicesAvailable: false,
  firebaseApp: null,
  firestore: null,
  auth: null,
  storage: null,
  user: null,
  isUserLoading: true,
  userError: null,
  isAdmin: false,
  isAdminLoading: true,
};

export function FirebaseClientProvider({ children }: FirebaseClientProviderProps) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const firebaseServices = useMemo(() => {
    if (!isMounted) return null;
    return initializeFirebase();
  }, [isMounted]);

  // Before Firebase is ready: still wrap children with a context so
  // useFirebase() / useUser() don't throw "must be used within a FirebaseProvider".
  if (!firebaseServices) {
    return (
      <FirebaseContext.Provider value={LOADING_CONTEXT}>
        {children}
      </FirebaseContext.Provider>
    );
  }

  return (
    <FirebaseProvider
      firebaseApp={firebaseServices.firebaseApp}
      auth={firebaseServices.auth}
      firestore={firebaseServices.firestore}
      storage={firebaseServices.storage}
    >
      {children}
    </FirebaseProvider>
  );
}
