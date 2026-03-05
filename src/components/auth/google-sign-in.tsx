'use client';

import { useState } from 'react';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { useAuth } from '@/firebase/provider';
import { Button } from '@/components/ui/button';

const ERROR_MESSAGES: Record<string, string> = {
  'auth/unauthorized-domain': 'Domínio não autorizado. Tente novamente com uma conta @entouragelab.com.',
  'auth/popup-closed-by-user': '', // silent — user intentionally closed
  'auth/cancelled-popup-request': '', // silent — duplicate popup
  'auth/user-disabled': 'Esta conta foi desativada. Contate o administrador.',
  'auth/account-exists-with-different-credential': 'Já existe uma conta com este e-mail usando outro método de login.',
};

export function GoogleSignIn() {
  const auth = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    setError(null);
    setIsLoading(true);

    try {
      const provider = new GoogleAuthProvider();
      // Always show the account picker so users can switch accounts.
      // Domain restriction (@entouragelab.com) is enforced server-side
      // in FirebaseProvider's onAuthStateChanged listener.
      provider.setCustomParameters({ prompt: 'select_account' });
      await signInWithPopup(auth, provider);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code ?? '';
      const message = ERROR_MESSAGES[code];

      // Only show error if we have a non-empty message (silent errors return '')
      if (message === undefined) {
        console.error('Google sign-in error:', err);
        setError('Erro ao entrar. Tente novamente com uma conta @entouragelab.com.');
      } else if (message) {
        setError(message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <Button onClick={handleGoogleSignIn} disabled={isLoading} className="w-full gap-2">
        <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true" fill="white">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
        </svg>
        {isLoading ? 'Entrando...' : 'Entrar com Google'}
      </Button>

      {error && (
        <p className="text-center text-sm text-red-500">{error}</p>
      )}
    </div>
  );
}
