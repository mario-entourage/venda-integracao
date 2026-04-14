'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Shield, Clock } from 'lucide-react';
import { useFirebase } from '@/firebase/provider';
import { createAuditSession } from '@/services/audit.service';
import { EXPIRY_OPTIONS } from '@/types/audit';
import { useToast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export default function AuditoriaPage() {
  const { firestore, user, isAdmin } = useFirebase();
  const router = useRouter();
  const { toast } = useToast();

  const [step, setStep] = useState<1 | 2>(1);
  const [acknowledged, setAcknowledged] = useState(false);
  const [auditorEmail, setAuditorEmail] = useState('');
  const [expiryMs, setExpiryMs] = useState(String(EXPIRY_OPTIONS[0].value));
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <PageHeader title="Auditoria" description="Acesso restrito a administradores." />
      </div>
    );
  }

  // ── Validation ──────────────────────────────────────────────────────────
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(auditorEmail);
  const isEntourageEmail = auditorEmail.toLowerCase().endsWith('@entouragelab.com');
  const canSubmit = emailValid && !isEntourageEmail && !isSubmitting;

  // ── Handlers ────────────────────────────────────────────────────────────
  const handleProceed = () => {
    if (!acknowledged) return;
    setStep(2);
  };

  const handleCreate = async () => {
    if (!firestore || !user || !canSubmit) return;

    setIsSubmitting(true);
    try {
      const expiresAt = new Date(Date.now() + Number(expiryMs));
      await createAuditSession(firestore, {
        creatingUserId: user.uid,
        creatingUserEmail: user.email!,
        auditorEmail: auditorEmail.trim().toLowerCase(),
        expiresAt,
      });

      toast({
        title: 'Sessão de auditoria criada',
        description: 'Faça logout e login novamente para ativar o modo auditoria.',
      });
      router.push('/usuarios');
    } catch (err) {
      console.error('[Auditoria] Error creating session:', err);
      toast({
        title: 'Erro ao criar sessão',
        description: 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Step 1: Warning ─────────────────────────────────────────────────────
  if (step === 1) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Criar Sessão de Auditoria"
          description="Conceda acesso temporário somente-leitura a um auditor externo."
        />

        <Card className="max-w-2xl border-amber-300 dark:border-amber-700">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <CardTitle className="text-lg">Aviso Importante</CardTitle>
                <CardDescription>Leia com atenção antes de prosseguir</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200 space-y-3">
              <div className="flex items-start gap-2">
                <Shield className="h-4 w-4 mt-0.5 shrink-0" />
                <p>
                  O usuário auditor terá acesso a <strong>informações confidenciais</strong>, incluindo
                  dados altamente sensíveis de pacientes, prescrições médicas, documentos regulatórios
                  e informações financeiras.
                </p>
              </div>
              <div className="flex items-start gap-2">
                <Shield className="h-4 w-4 mt-0.5 shrink-0" />
                <p>
                  O auditor <strong>deve ter assinado um NDA</strong> (Acordo de Confidencialidade)
                  antes de receber acesso ao sistema.
                </p>
              </div>
              <div className="flex items-start gap-2">
                <Clock className="h-4 w-4 mt-0.5 shrink-0" />
                <p>
                  Esta função deve ser utilizada com <strong>muita parcimônia</strong>. O acesso é
                  temporário e será automaticamente revogado após o tempo definido.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 pt-2">
              <Checkbox
                id="acknowledge"
                checked={acknowledged}
                onCheckedChange={(v) => setAcknowledged(v === true)}
              />
              <Label htmlFor="acknowledge" className="text-sm leading-relaxed cursor-pointer">
                Entendo a seriedade desta ação e confirmo que o auditor assinou um NDA.
              </Label>
            </div>
          </CardContent>
          <CardFooter className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => router.push('/usuarios')}>
              Cancelar
            </Button>
            <Button onClick={handleProceed} disabled={!acknowledged}>
              Prosseguir
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // ── Step 2: Form ────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <PageHeader
        title="Criar Sessão de Auditoria"
        description="Configure os detalhes da sessão de auditoria."
      />

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Detalhes da Sessão</CardTitle>
          <CardDescription>
            Defina o tempo de acesso e o email do auditor.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="expiry">Tempo de Acesso</Label>
            <Select value={expiryMs} onValueChange={setExpiryMs}>
              <SelectTrigger id="expiry" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPIRY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={String(opt.value)}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              O acesso será automaticamente revogado após este período. Máximo: 1 semana.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email do Auditor</Label>
            <Input
              id="email"
              type="email"
              placeholder="auditor@empresa.com"
              value={auditorEmail}
              onChange={(e) => setAuditorEmail(e.target.value)}
            />
            {isEntourageEmail && (
              <p className="text-xs text-destructive">
                Use um email externo — emails @entouragelab.com não são permitidos.
              </p>
            )}
            {auditorEmail && !emailValid && (
              <p className="text-xs text-destructive">Email inválido.</p>
            )}
            <p className="text-xs text-muted-foreground">
              Informe o email institucional (não pessoal) do auditor.
            </p>
          </div>
        </CardContent>
        <CardFooter className="flex justify-between">
          <Button variant="outline" onClick={() => setStep(1)}>
            ← Voltar
          </Button>
          <Button onClick={handleCreate} disabled={!canSubmit}>
            {isSubmitting ? 'Criando...' : 'Criar Sessão de Auditoria'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
