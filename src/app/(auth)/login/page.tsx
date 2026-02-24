'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useUser } from '@/firebase/provider';
import { GoogleSignIn } from '@/components/auth/google-sign-in';

export default function LoginPage() {
  const { user, isUserLoading, userError } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (!isUserLoading && user) {
      router.replace('/dashboard');
    }
  }, [user, isUserLoading, router]);

  return (
    <div className="w-full max-w-sm rounded-2xl bg-white px-8 py-10 shadow-md space-y-6">
      {/* Logo */}
      <div className="flex justify-center">
        <Image src="/logo.png" alt="Entourage Phytolab" width={240} height={80} priority />
      </div>

      {/* Title */}
      <div className="text-center space-y-1">
        <h1 className="text-3xl font-bold text-slate-900">Project VENDA</h1>
        <p className="text-sm text-slate-500">Acesso restrito para @entouragelab.com</p>
      </div>

      {/* Sign in */}
      <GoogleSignIn />

      {/* Error */}
      {userError && (
        <p className="text-center text-sm text-red-500">{userError.message}</p>
      )}

      {/* Disclaimer */}
      <p className="text-center text-xs text-slate-400 leading-relaxed">
        Ao continuar, você concorda com nossos{' '}
        <span className="underline cursor-pointer">Termos de Serviço</span>{' '}
        e{' '}
        <span className="underline cursor-pointer">Política de Privacidade</span>.
      </p>
    </div>
  );
}
