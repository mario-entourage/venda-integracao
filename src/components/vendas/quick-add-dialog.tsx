'use client';

import React, { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { CustomerForm } from '@/components/forms/customer-form';
import { DoctorForm } from '@/components/forms/doctor-form';
import { useFirebase } from '@/firebase/provider';
import { createClient } from '@/services/clients.service';
import { createDoctor } from '@/services/doctors.service';
import { useToast } from '@/hooks/use-toast';
import type { CustomerFormValues, DoctorFormValues } from '@/types';

// ─── Quick-add Client ─────────────────────────────────────────────────────────

interface QuickAddClientDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (clientId: string, clientName: string, clientDocument: string, clientPhone: string) => void;
  prefillName?: string;
  prefillDocument?: string;
}

export function QuickAddClientDialog({
  open,
  onClose,
  onCreated,
  prefillName,
  prefillDocument,
}: QuickAddClientDialogProps) {
  const { firestore } = useFirebase();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);

  // Parse prefill name into first/last
  const nameParts = (prefillName ?? '').trim().split(' ');
  const firstName = nameParts[0] ?? '';
  const lastName = nameParts.slice(1).join(' ') || undefined;

  const handleSubmit = async (data: CustomerFormValues) => {
    if (!firestore) return;
    setIsSaving(true);
    try {
      const clientId = await createClient(firestore, data);
      const fullName = `${data.firstName} ${data.lastName || ''}`.trim();
      toast({ title: 'Cliente cadastrado com sucesso.' });
      onCreated(clientId, fullName, data.document, data.phone ?? '');
      onClose();
    } catch {
      toast({ title: 'Erro ao cadastrar cliente.', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cadastrar Novo Paciente</DialogTitle>
          <DialogDescription>
            Preencha os dados extraídos da receita. Campos obrigatórios marcados com *.
          </DialogDescription>
        </DialogHeader>
        <CustomerForm
          onSubmit={handleSubmit}
          defaultValues={{
            firstName,
            lastName,
            document: prefillDocument ?? '',
          }}
          isLoading={isSaving}
          submitLabel="Cadastrar e Selecionar"
        />
      </DialogContent>
    </Dialog>
  );
}

// ─── Quick-add Doctor ─────────────────────────────────────────────────────────

interface QuickAddDoctorDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (doctorId: string, doctorName: string, doctorCrm: string) => void;
  prefillName?: string;
  prefillCrm?: string;
}

export function QuickAddDoctorDialog({
  open,
  onClose,
  onCreated,
  prefillName,
  prefillCrm,
}: QuickAddDoctorDialogProps) {
  const { firestore } = useFirebase();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);

  const nameParts = (prefillName ?? '').replace(/^Dr\.?\s*/i, '').trim().split(' ');
  const firstName = nameParts[0] ?? '';
  const lastName = nameParts.slice(1).join(' ') || undefined;

  // Parse CRM to extract state: "12345/SP" or "12345-SP"
  const crmMatch = (prefillCrm ?? '').match(/^(\d+)[\/\-]?([A-Z]{2})?$/i);
  const crmNumber = crmMatch?.[1] ?? prefillCrm ?? '';
  const crmState = (crmMatch?.[2] ?? '').toUpperCase();

  const handleSubmit = async (data: DoctorFormValues) => {
    if (!firestore) return;
    setIsSaving(true);
    try {
      const doctorId = await createDoctor(firestore, data);
      const fullName = `${data.firstName} ${data.lastName || ''}`.trim();
      toast({ title: 'Médico cadastrado com sucesso.' });
      onCreated(doctorId, fullName, data.crm);
      onClose();
    } catch {
      toast({ title: 'Erro ao cadastrar médico.', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cadastrar Novo Médico</DialogTitle>
          <DialogDescription>
            Preencha os dados extraídos da receita. Campos obrigatórios marcados com *.
          </DialogDescription>
        </DialogHeader>
        <DoctorForm
          onSubmit={handleSubmit}
          defaultValues={{
            firstName,
            lastName,
            crm: prefillCrm ?? crmNumber,
            state: crmState || undefined,
            document: '',
          }}
          isLoading={isSaving}
          submitLabel="Cadastrar e Selecionar"
          compact
        />
      </DialogContent>
    </Dialog>
  );
}
