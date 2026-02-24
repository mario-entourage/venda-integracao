'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/firebase/provider';
import { GoogleSignIn } from '@/components/auth/google-sign-in';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function LoginPage() {
  const { user, isUserLoading, userError } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (!isUserLoading && user) {
      router.replace('/dashboard');
    }
  }, [user, isUserLoading, router]);

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="text-center space-y-1">
        <CardTitle className="font-headline text-2xl">Entourage Lab</CardTitle>
        <CardDescription>
          Acesso restrito a colaboradores com conta @entouragelab.com
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <GoogleSignIn />
        {userError && (
          <p className="text-center text-sm text-destructive">
            {userError.message}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
