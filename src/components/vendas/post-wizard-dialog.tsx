'use client';

/**
 * PostWizardDialog
 * ────────────────
 * Shown after the wizard's "Finalizar Venda" button completes successfully,
 * but ONLY when at least one entity (client or doctor) was quick-added during
 * the wizard.  Lets the user fill in supplementary fields that were omitted
 * from the quick-add forms to keep that flow fast.
 *
 * Extra fields offered:
 *   Client  → Sexo, Nome da Mãe
 *   Doctor  → CPF
 *
 * Calling onDone() (either via "Pular" or after saving) hands control back
 * to the wizard, which then navigates to the order detail page.
 */

import React, { useState } from 'react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useFirebase } from '@/firebase/provider';
import { useToast } from '@/hooks/use-toast';

// ─── types ────────────────────────────────────────────────────────────────────

export interface PostWizardDialogProps {
  open: boolean;
  /** Called when the dialog should be closed and navigation should proceed */
  onDone: () => void;

  clientId: string;
  clientName: string;
  clientIsNew: boolean;

  doctorId: string;
  doctorName: string;
  doctorIsNew: boolean;
}

// ─── component ────────────────────────────────────────────────────────────────

export function PostWizardDialog({
  open,
  onDone,
  clientId,
  clientName,
  clientIsNew,
  doctorId,
  doctorName,
  doctorIsNew,
}: PostWizardDialogProps) {
  const { firestore } = useFirebase();
  const { toast } = useToast();

  // ── client extra fields ──────────────────────────────────────────────────
  const [sex, setSex] = useState('');
  const [motherName, setMotherName] = useState('');

  // ── doctor extra fields ──────────────────────────────────────────────────
  const [doctorCpf, setDoctorCpf] = useState('');

  const [isSaving, setIsSaving] = useState(false);

  // Nothing to show — this component shouldn't even be rendered, but guard anyway
  if (!clientIsNew && !doctorIsNew) return null;

  const handleSave = async () => {
    if (!firestore) { onDone(); return; }
    setIsSaving(true);
    try {
      // Persist client extras (write only non-empty values)
      if (clientIsNew && (sex || motherName.trim())) {
        const clientUpdates: Record<string, unknown> = { updatedAt: serverTimestamp() };
        if (sex)                clientUpdates.sex        = sex;
        if (motherName.trim())  clientUpdates.motherName = motherName.trim();
        await updateDoc(doc(firestore, 'clients', clientId), clientUpdates);
      }

      // Persist doctor CPF
      if (doctorIsNew && doctorCpf.trim()) {
        await updateDoc(doc(firestore, 'doctors', doctorId), {
          document:   doctorCpf.trim(),
          updatedAt:  serverTimestamp(),
        });
      }

      toast({ title: 'Informações complementares salvas com sucesso.' });
    } catch (err) {
      console.error('PostWizardDialog save error:', err);
      toast({ title: 'Erro ao salvar informações. Continue normalmente.', variant: 'destructive' });
    } finally {
      setIsSaving(false);
      onDone();
    }
  };

  const handleSkip = () => {
    if (!isSaving) onDone();
  };

  // ── helpers ───────────────────────────────────────────────────────────────

  const hasSomethingToSave =
    (clientIsNew && (sex || motherName.trim())) ||
    (doctorIsNew && doctorCpf.trim());

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleSkip(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Completar Cadastros</DialogTitle>
          <DialogDescription>
            Adicione informações complementares sobre os novos cadastros criados
            nesta venda. Estes campos são opcionais — você pode pular e preencher
            depois.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">

          {/* ── Client section ── */}
          {clientIsNew && (
            <div className="space-y-3">
              {/* Section header */}
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
                  P
                </span>
                <span className="text-sm font-semibold">{clientName}</span>
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                  novo paciente
                </span>
              </div>

              {/* Fields */}
              <div className="grid grid-cols-2 gap-3 pl-8">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Sexo</Label>
                  <Select value={sex} onValueChange={setSex}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Selecione…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="M">Masculino</SelectItem>
                      <SelectItem value="F">Feminino</SelectItem>
                      <SelectItem value="O">Outro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Nome da Mãe</Label>
                  <Input
                    className="h-9"
                    placeholder="Nome completo"
                    value={motherName}
                    onChange={(e) => setMotherName(e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Divider when both sections are shown */}
          {clientIsNew && doctorIsNew && (
            <div className="border-t" />
          )}

          {/* ── Doctor section ── */}
          {doctorIsNew && (
            <div className="space-y-3">
              {/* Section header */}
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold text-white">
                  M
                </span>
                <span className="text-sm font-semibold">{doctorName}</span>
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                  novo médico
                </span>
              </div>

              {/* Fields */}
              <div className="pl-8">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">CPF do Médico</Label>
                  <Input
                    className="h-9 max-w-[200px]"
                    placeholder="000.000.000-00"
                    value={doctorCpf}
                    onChange={(e) => setDoctorCpf(e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}

        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleSkip} disabled={isSaving}>
            Pular
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving || !hasSomethingToSave}
          >
            {isSaving ? 'Salvando…' : 'Salvar e Continuar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
