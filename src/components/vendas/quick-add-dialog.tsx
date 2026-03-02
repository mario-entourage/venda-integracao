'use client';

import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { collection, addDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  Form, FormField, FormItem, FormLabel, FormControl, FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import { useFirebase } from '@/firebase/provider';
import { useToast } from '@/hooks/use-toast';
import { BRAZILIAN_STATES } from '@/lib/constants';

// ─── Client dialog ─────────────────────────────────────────────────────────────

const clientQuickSchema = z.object({
  firstName:    z.string().min(1, 'Nome obrigatório'),
  lastName:     z.string().optional(),
  cpf:          z.string().optional(),
  rg:           z.string().optional(),
  birthDate:    z.string().optional(),   // stored as "YYYY-MM-DD" string; converted to Timestamp on save
  phone:        z.string().optional(),
  email:        z.string().email('E-mail inválido').optional().or(z.literal('')),
  postalCode:   z.string().optional(),
  street:       z.string().optional(),
  number:       z.string().optional(),
  complement:   z.string().optional(),
  neighborhood: z.string().optional(),
  city:         z.string().optional(),
  state:        z.string().optional(),
});

type ClientQuickValues = z.infer<typeof clientQuickSchema>;

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

  const form = useForm<ClientQuickValues>({
    resolver: zodResolver(clientQuickSchema),
    defaultValues: {},
  });

  // Every time the dialog opens, reset with the latest prescription data.
  // useForm defaultValues are only read on first mount, so we must reset
  // explicitly here whenever `open` flips to true.
  useEffect(() => {
    if (!open) return;
    const parts = (prefillName ?? '').trim().split(' ');
    form.reset({
      firstName: parts[0] ?? '',
      lastName:  parts.slice(1).join(' ') || '',
      cpf:       prefillDocument ?? '',
    });
  }, [open, prefillName, prefillDocument, form]);

  const { formState: { isSubmitting } } = form;

  const handleSubmit = async (data: ClientQuickValues) => {
    if (!firestore) return;
    try {
      const fullName = `${data.firstName} ${data.lastName ?? ''}`.trim();
      // Convert date string to Firestore Timestamp if provided
      const birthTimestamp = data.birthDate
        ? Timestamp.fromDate(new Date(data.birthDate + 'T12:00:00'))
        : null;
      // Build address object only if at least one address field is filled
      const hasAddress = !!(data.postalCode || data.street || data.city);
      const address = hasAddress ? {
        postalCode:   data.postalCode   ?? '',
        street:       data.street       ?? '',
        number:       data.number       ?? '',
        complement:   data.complement   ?? '',
        neighborhood: data.neighborhood ?? '',
        city:         data.city         ?? '',
        state:        data.state        ?? '',
        country:      'BR',
      } : null;

      const ref = await addDoc(collection(firestore, 'clients'), {
        document:        data.cpf          ?? '',
        rg:              data.rg           ?? '',
        firstName:       data.firstName,
        lastName:        data.lastName     ?? '',
        fullName,
        email:           data.email        ?? '',
        phone:           data.phone        ?? '',
        birthDate:       birthTimestamp,
        address,
        active:          true,
        createdAt:       serverTimestamp(),
        updatedAt:       serverTimestamp(),
      });

      toast({ title: 'Paciente cadastrado com sucesso.' });
      onCreated(ref.id, fullName, data.cpf ?? '', data.phone ?? '');
      form.reset();
      onClose();
    } catch (err) {
      console.error('Error creating client:', err);
      toast({ title: 'Erro ao cadastrar paciente.', variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { form.reset(); onClose(); } }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cadastrar Novo Paciente</DialogTitle>
          <DialogDescription>
            Preencha os dados do paciente. Campos marcados com * são obrigatórios.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-5 pt-1">

            {/* ── Nome ── */}
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="firstName" render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome <span className="text-red-500">*</span></FormLabel>
                  <FormControl><Input placeholder="João" {...field} value={field.value ?? ''} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="lastName" render={({ field }) => (
                <FormItem>
                  <FormLabel>Sobrenome</FormLabel>
                  <FormControl><Input placeholder="Silva" {...field} value={field.value ?? ''} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {/* ── CPF + RG ── */}
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="cpf" render={({ field }) => (
                <FormItem>
                  <FormLabel>CPF</FormLabel>
                  <FormControl><Input placeholder="000.000.000-00" {...field} value={field.value ?? ''} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="rg" render={({ field }) => (
                <FormItem>
                  <FormLabel>Nº do Documento de Identificação (RG)</FormLabel>
                  <FormControl><Input placeholder="12.345.678-9" {...field} value={field.value ?? ''} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {/* ── Data de Nascimento + Celular ── */}
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="birthDate" render={({ field }) => (
                <FormItem>
                  <FormLabel>Data de Nascimento</FormLabel>
                  <FormControl><Input type="date" {...field} value={field.value ?? ''} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="phone" render={({ field }) => (
                <FormItem>
                  <FormLabel>Celular</FormLabel>
                  <FormControl><Input placeholder="(00) 00000-0000" {...field} value={field.value ?? ''} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {/* ── E-mail ── */}
            <FormField control={form.control} name="email" render={({ field }) => (
              <FormItem>
                <FormLabel>E-mail do Paciente</FormLabel>
                <FormControl><Input type="email" placeholder="paciente@email.com" {...field} value={field.value ?? ''} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            {/* ── Address divider ── */}
            <div className="flex items-center gap-3 pt-1">
              <div className="flex-1 border-t" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Endereço</span>
              <div className="flex-1 border-t" />
            </div>

            {/* ── CEP + Logradouro ── */}
            <div className="grid grid-cols-[140px_1fr] gap-4">
              <FormField control={form.control} name="postalCode" render={({ field }) => (
                <FormItem>
                  <FormLabel>CEP</FormLabel>
                  <FormControl><Input placeholder="00000-000" {...field} value={field.value ?? ''} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="street" render={({ field }) => (
                <FormItem>
                  <FormLabel>Endereço Completo (Rua / Av.)</FormLabel>
                  <FormControl><Input placeholder="Rua das Flores" {...field} value={field.value ?? ''} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {/* ── Número + Complemento ── */}
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="number" render={({ field }) => (
                <FormItem>
                  <FormLabel>Número</FormLabel>
                  <FormControl><Input placeholder="123" {...field} value={field.value ?? ''} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="complement" render={({ field }) => (
                <FormItem>
                  <FormLabel>Complemento</FormLabel>
                  <FormControl><Input placeholder="Apto 4, Bloco B" {...field} value={field.value ?? ''} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {/* ── Bairro + Município + Estado ── */}
            <div className="grid grid-cols-[1fr_1fr_100px] gap-4">
              <FormField control={form.control} name="neighborhood" render={({ field }) => (
                <FormItem>
                  <FormLabel>Bairro</FormLabel>
                  <FormControl><Input placeholder="Centro" {...field} value={field.value ?? ''} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="city" render={({ field }) => (
                <FormItem>
                  <FormLabel>Município</FormLabel>
                  <FormControl><Input placeholder="São Paulo" {...field} value={field.value ?? ''} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="state" render={({ field }) => (
                <FormItem>
                  <FormLabel>Estado (UF)</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value ?? ''}>
                    <FormControl>
                      <SelectTrigger><SelectValue placeholder="UF" /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {BRAZILIAN_STATES.map((uf) => (
                        <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting ? 'Cadastrando…' : 'Cadastrar e Selecionar'}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Representante dialog ───────────────────────────────────────────────────────

const representanteQuickSchema = z.object({
  name: z.string().min(1, 'Nome obrigatório'),
  code: z.string().min(1, 'Código obrigatório'),
  email: z.string().email('E-mail inválido').optional().or(z.literal('')),
  phone: z.string().optional(),
});

type RepresentanteQuickValues = z.infer<typeof representanteQuickSchema>;

interface QuickAddRepresentanteDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (representanteId: string, name: string, code: string) => void;
}

export function QuickAddRepresentanteDialog({
  open,
  onClose,
  onCreated,
}: QuickAddRepresentanteDialogProps) {
  const { firestore } = useFirebase();
  const { toast } = useToast();

  const form = useForm<RepresentanteQuickValues>({
    resolver: zodResolver(representanteQuickSchema),
    defaultValues: { name: '', code: '', email: '', phone: '' },
  });

  useEffect(() => {
    if (open) form.reset({ name: '', code: '', email: '', phone: '' });
  }, [open, form]);

  const { formState: { isSubmitting } } = form;

  const handleSubmit = async (data: RepresentanteQuickValues) => {
    if (!firestore) return;
    try {
      const ref = await addDoc(collection(firestore, 'representantes'), {
        name: data.name.trim(),
        code: data.code.trim().toUpperCase(),
        email: data.email ?? '',
        phone: data.phone ?? '',
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      toast({ title: 'Representante cadastrado com sucesso.' });
      onCreated(ref.id, data.name.trim(), data.code.trim().toUpperCase());
      form.reset();
      onClose();
    } catch (err) {
      console.error('Error creating representante:', err);
      toast({ title: 'Erro ao cadastrar representante.', variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { form.reset(); onClose(); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Cadastrar Novo Representante</DialogTitle>
          <DialogDescription>
            Preencha os dados do representante. Campos marcados com * são obrigatórios.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4 pt-1">
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome <span className="text-red-500">*</span></FormLabel>
                  <FormControl><Input placeholder="João Silva" {...field} value={field.value ?? ''} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="code" render={({ field }) => (
                <FormItem>
                  <FormLabel>Código <span className="text-red-500">*</span></FormLabel>
                  <FormControl><Input placeholder="REP001" {...field} value={field.value ?? ''} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="email" render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl><Input type="email" placeholder="rep@exemplo.com" {...field} value={field.value ?? ''} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="phone" render={({ field }) => (
                <FormItem>
                  <FormLabel>Telefone</FormLabel>
                  <FormControl><Input placeholder="(11) 99999-9999" {...field} value={field.value ?? ''} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting ? 'Cadastrando…' : 'Cadastrar e Selecionar'}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Doctor dialog ─────────────────────────────────────────────────────────────

const doctorQuickSchema = z.object({
  firstName:   z.string().min(1, 'Nome obrigatório'),
  lastName:    z.string().optional(),
  crm:         z.string().min(1, 'CRM/CRO obrigatório'),
  specialty:   z.string().optional(),
  state:       z.string().optional(),
  city:        z.string().optional(),
  phone:       z.string().optional(),
  mobilePhone: z.string().optional(),
  email:       z.string().email('E-mail inválido').optional().or(z.literal('')),
});

type DoctorQuickValues = z.infer<typeof doctorQuickSchema>;

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

  const form = useForm<DoctorQuickValues>({
    resolver: zodResolver(doctorQuickSchema),
    defaultValues: {},
  });

  // Every time the dialog opens, reset with the latest prescription data.
  // Parse "12345/SP" or "12345-SP" to split CRM number from state abbreviation.
  useEffect(() => {
    if (!open) return;
    const parts = (prefillName ?? '').replace(/^Dr\.?\s*/i, '').trim().split(' ');
    const crmMatch = (prefillCrm ?? '').match(/^(\d+)[\/\-]?([A-Z]{2})?$/i);
    form.reset({
      firstName: parts[0] ?? '',
      lastName:  parts.slice(1).join(' ') || '',
      crm:       prefillCrm ?? crmMatch?.[1] ?? '',
      state:     (crmMatch?.[2] ?? '').toUpperCase() || undefined,
    });
  }, [open, prefillName, prefillCrm, form]);

  const { formState: { isSubmitting } } = form;

  const handleSubmit = async (data: DoctorQuickValues) => {
    if (!firestore) return;
    try {
      const fullName = `${data.firstName} ${data.lastName ?? ''}`.trim();

      const ref = await addDoc(collection(firestore, 'doctors'), {
        firstName:     data.firstName,
        lastName:      data.lastName    ?? '',
        fullName,
        email:         data.email       ?? '',
        crm:           data.crm,
        mainSpecialty: data.specialty   ?? '',
        state:         data.state       ?? '',
        city:          data.city        ?? '',
        phone:         data.phone       ?? '',
        mobilePhone:   data.mobilePhone ?? '',
        active:        true,
        createdAt:     serverTimestamp(),
        updatedAt:     serverTimestamp(),
      });

      toast({ title: 'Médico cadastrado com sucesso.' });
      onCreated(ref.id, fullName, data.crm);
      form.reset();
      onClose();
    } catch (err) {
      console.error('Error creating doctor:', err);
      toast({ title: 'Erro ao cadastrar médico.', variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { form.reset(); onClose(); } }}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cadastrar Novo Médico / Prescritor</DialogTitle>
          <DialogDescription>
            Preencha os dados do prescritor. Campos marcados com * são obrigatórios.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-5 pt-1">

            {/* ── Nome ── */}
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="firstName" render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome do Profissional <span className="text-red-500">*</span></FormLabel>
                  <FormControl><Input placeholder="Carlos" {...field} value={field.value ?? ''} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="lastName" render={({ field }) => (
                <FormItem>
                  <FormLabel>Sobrenome</FormLabel>
                  <FormControl><Input placeholder="Ferreira" {...field} value={field.value ?? ''} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {/* ── CRM + Especialidade ── */}
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="crm" render={({ field }) => (
                <FormItem>
                  <FormLabel>Nº do CRM/CRO <span className="text-red-500">*</span></FormLabel>
                  <FormControl><Input placeholder="12345/SP" {...field} value={field.value ?? ''} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="specialty" render={({ field }) => (
                <FormItem>
                  <FormLabel>Especialidade</FormLabel>
                  <FormControl><Input placeholder="Oncologia" {...field} value={field.value ?? ''} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {/* ── Estado do Prescritor + Município ── */}
            <div className="grid grid-cols-[100px_1fr] gap-4">
              <FormField control={form.control} name="state" render={({ field }) => (
                <FormItem>
                  <FormLabel>Estado do Prescritor</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value ?? ''}>
                    <FormControl>
                      <SelectTrigger><SelectValue placeholder="UF" /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {BRAZILIAN_STATES.map((uf) => (
                        <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="city" render={({ field }) => (
                <FormItem>
                  <FormLabel>Município do Prescritor</FormLabel>
                  <FormControl><Input placeholder="São Paulo" {...field} value={field.value ?? ''} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {/* ── Telefone Fixo + Celular ── */}
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="phone" render={({ field }) => (
                <FormItem>
                  <FormLabel>Telefone Fixo do Prescritor</FormLabel>
                  <FormControl><Input placeholder="(00) 0000-0000" {...field} value={field.value ?? ''} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="mobilePhone" render={({ field }) => (
                <FormItem>
                  <FormLabel>Celular do Prescritor</FormLabel>
                  <FormControl><Input placeholder="(00) 00000-0000" {...field} value={field.value ?? ''} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {/* ── E-mail ── */}
            <FormField control={form.control} name="email" render={({ field }) => (
              <FormItem>
                <FormLabel>E-mail para Contato</FormLabel>
                <FormControl><Input type="email" placeholder="medico@clinica.com.br" {...field} value={field.value ?? ''} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting ? 'Cadastrando…' : 'Cadastrar e Selecionar'}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
