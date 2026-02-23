'use client';

import React, { DependencyList, createContext, useContext, ReactNode, useMemo, useState, useEffect } from 'react';
import { FirebaseApp } from 'firebase/app';
import { Firestore, doc, onSnapshot } from 'firebase/firestore';
import { Auth, User, onAuthStateChanged } from 'firebase/auth';
import { FirebaseStorage } from 'firebase/storage';
import { FirebaseErrorListener } from '@/components/FirebaseErrorListener'

// Super-admins are hardcoded and always have admin access
const SUPER_ADMIN_EMAILS = ['caio@entouragelab.com', 'mario@entouragelab.com'];

interface FirebaseProviderProps {
  children: ReactNode;
  firebaseApp: FirebaseApp;
  firestore: Firestore;
  auth: Auth;
  storage: FirebaseStorage;
}

// Internal state for user authentication
interface UserAuthState {
  user: User | null;
  isUserLoading: boolean;
  userError: Error | null;
}

// Combined state for the Firebase context
export interface FirebaseContextState {
  areServicesAvailable: boolean; // True if core services (app, firestore, auth instance) are provided
  firebaseApp: FirebaseApp | null;
  firestore: Firestore | null;
  auth: Auth | null; // The Auth service instance
  storage: FirebaseStorage | null;
  // User authentication state
  user: User | null;
  isUserLoading: boolean; // True during initial auth check
  userError: Error | null; // Error from auth listener
  isAdmin: boolean;
  isAdminLoading: boolean;
}

// Return type for useFirebase()
export interface FirebaseServicesAndUser {
  firebaseApp: FirebaseApp;
  firestore: Firestore;
  auth: Auth;
  storage: FirebaseStorage;
  user: User | null;
  isUserLoading: boolean;
  userError: Error | null;
  isAdmin: boolean;
  isAdminLoading: boolean;
}

// Return type for useUser() - specific to user auth state
export interface UserHookResult { // Renamed from UserAuthHookResult for consistency if desired, or keep as UserAuthHookResult
  user: User | null;
  isUserLoading: boolean;
  userError: Error | null;
  isAdmin: boolean;
  isAdminLoading: boolean;
}

// React Context
export const FirebaseContext = createContext<FirebaseContextState | undefined>(undefined);

/**
 * FirebaseProvider manages and provides Firebase services and user authentication state.
 */
export const FirebaseProvider: React.FC<FirebaseProviderProps> = ({
  children,
  firebaseApp,
  firestore,
  auth,
  storage,
}) => {
  const [userAuthState, setUserAuthState] = useState<UserAuthState>({
    user: null,
    isUserLoading: true, // Start loading until first auth event
    userError: null,
  });

  // Effect to subscribe to Firebase auth state changes
  useEffect(() => {
    if (!auth) { // If no Auth service instance, cannot determine user state
      setUserAuthState({ user: null, isUserLoading: false, userError: new Error("Auth service not provided.") });
      return;
    }

    setUserAuthState({ user: null, isUserLoading: true, userError: null }); // Reset on auth instance change

    const unsubscribe = onAuthStateChanged(
      auth,
      (firebaseUser) => { // Auth state determined
        if (firebaseUser && firebaseUser.email && !firebaseUser.email.endsWith('@entouragelab.com')) {
            console.warn(`Access denied for ${firebaseUser.email}. Signing out.`);
            auth.signOut(); // This will re-trigger onAuthStateChanged with a null user
            // Set an error to be surfaced in the UI
            setUserAuthState({ user: null, isUserLoading: false, userError: new Error("Access restricted to @entouragelab.com users.") });
        } else {
            setUserAuthState({ user: firebaseUser, isUserLoading: false, userError: null });
        }
      },
      (error) => { // Auth listener error
        console.error("FirebaseProvider: onAuthStateChanged error:", error);
        setUserAuthState({ user: null, isUserLoading: false, userError: error });
      }
    );
    return () => unsubscribe(); // Cleanup
  }, [auth]); // Depends on the auth instance

  // Track admin status from roles_admin collection
  const [isDynamicAdmin, setIsDynamicAdmin] = useState(false);
  const [isDynamicAdminLoading, setIsDynamicAdminLoading] = useState(true);

  // Check if user is a super-admin (hardcoded)
  const isSuperAdmin = useMemo(() => {
    if (!userAuthState.user?.email) return false;
    return SUPER_ADMIN_EMAILS.includes(userAuthState.user.email);
  }, [userAuthState.user]);

  // Subscribe to roles_admin document for dynamic admin status
  useEffect(() => {
    if (!firestore || !userAuthState.user?.uid) {
      setIsDynamicAdmin(false);
      setIsDynamicAdminLoading(false);
      return;
    }

    // If user is already a super-admin, no need to check Firestore
    if (isSuperAdmin) {
      setIsDynamicAdmin(false);
      setIsDynamicAdminLoading(false);
      return;
    }

    setIsDynamicAdminLoading(true);
    const adminDocRef = doc(firestore, 'roles_admin', userAuthState.user.uid);

    const unsubscribe = onSnapshot(
      adminDocRef,
      (docSnapshot) => {
        setIsDynamicAdmin(docSnapshot.exists());
        setIsDynamicAdminLoading(false);
      },
      (error) => {
        console.error('Error checking admin status:', error);
        setIsDynamicAdmin(false);
        setIsDynamicAdminLoading(false);
      }
    );

    return () => unsubscribe();
  }, [firestore, userAuthState.user?.uid, isSuperAdmin]);

  // User is admin if they're a super-admin OR have a roles_admin document
  const isAdmin = isSuperAdmin || isDynamicAdmin;
  const isAdminLoading = userAuthState.isUserLoading || isDynamicAdminLoading;


  // Memoize the context value
  const contextValue = useMemo((): FirebaseContextState => {
    const servicesAvailable = !!(firebaseApp && firestore && auth && storage);
    return {
      areServicesAvailable: servicesAvailable,
      firebaseApp: servicesAvailable ? firebaseApp : null,
      firestore: servicesAvailable ? firestore : null,
      auth: servicesAvailable ? auth : null,
      storage: servicesAvailable ? storage : null,
      user: userAuthState.user,
      isUserLoading: userAuthState.isUserLoading,
      userError: userAuthState.userError,
      isAdmin,
      isAdminLoading,
    };
  }, [firebaseApp, firestore, auth, storage, userAuthState, isAdmin, isAdminLoading]);

  return (
    <FirebaseContext.Provider value={contextValue}>
      <FirebaseErrorListener />
      {children}
    </FirebaseContext.Provider>
  );
};

/**
 * Hook to access core Firebase services and user authentication state.
 * Throws error if core services are not available or used outside provider.
 */
export const useFirebase = (): FirebaseServicesAndUser => {
  const context = useContext(FirebaseContext);

  if (context === undefined) {
    throw new Error('useFirebase must be used within a FirebaseProvider.');
  }

  if (!context.areServicesAvailable || !context.firebaseApp || !context.firestore || !context.auth || !context.storage) {
    throw new Error('Firebase core services not available. Check FirebaseProvider props.');
  }

  return {
    firebaseApp: context.firebaseApp,
    firestore: context.firestore,
    auth: context.auth,
    storage: context.storage,
    user: context.user,
    isUserLoading: context.isUserLoading,
    userError: context.userError,
    isAdmin: context.isAdmin,
    isAdminLoading: context.isAdminLoading,
  };
};

/** Hook to access Firebase Auth instance. */
export const useAuth = (): Auth => {
  const { auth } = useFirebase();
  return auth;
};

/** Hook to access Firestore instance. */
export const useFirestore = (): Firestore => {
  const { firestore } = useFirebase();
  return firestore;
};

/** Hook to access Firebase Storage instance. */
export const useStorage = (): FirebaseStorage => {
  const { storage } = useFirebase();
  return storage;
};

/** Hook to access Firebase App instance. */
export const useFirebaseApp = (): FirebaseApp => {
  const { firebaseApp } = useFirebase();
  return firebaseApp;
};

type MemoFirebase <T> = T & {__memo?: boolean};

export function useMemoFirebase<T>(factory: () => T, deps: DependencyList): T | (MemoFirebase<T>) {
  const memoized = useMemo(factory, deps);

  if(typeof memoized !== 'object' || memoized === null) return memoized;
  (memoized as MemoFirebase<T>).__memo = true;

  return memoized;
}

/**
 * Hook specifically for accessing the authenticated user's state.
 * This provides the User object, loading status, and any auth errors.
 * @returns {UserHookResult} Object with user, isUserLoading, userError.
 */
export const useUser = (): UserHookResult => { // Renamed from useAuthUser
  const { user, isUserLoading, userError, isAdmin, isAdminLoading } = useFirebase(); // Leverages the main hook
  return { user, isUserLoading, userError, isAdmin, isAdminLoading };
};
