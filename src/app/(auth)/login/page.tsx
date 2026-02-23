'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { GoogleSignIn } from '@/components/auth/google-sign-in';
import { LoginForm } from '@/components/auth/login-form';
import { useUser } from '@/firebase/provider';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function LoginPage() {
  const { user, isUserLoading } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (!isUserLoading && user) {
      router.replace('/dashboard');
    }
  }, [user, isUserLoading, router]);

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <CardTitle className="font-headline text-2xl">Entourage Lab</CardTitle>
        <CardDescription>Entre com sua conta para continuar</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <GoogleSignIn />
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <Separator className="w-full" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-2 text-muted-foreground">ou</span>
          </div>
        </div>
        <LoginForm />
      </CardContent>
    </Card>
  );
}
