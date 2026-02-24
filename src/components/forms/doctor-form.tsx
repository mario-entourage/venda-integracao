'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import ReactInputMask from 'react-input-mask';
import { doctorSchema, type DoctorFormValues } from '@/types/forms';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Form, FormField, FormItem, FormLabel, FormControl, FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';

interface DoctorFormProps {
  onSubmit: (data: DoctorFormValues) => void | Promise<void>;
  defaultValues?: Partial<DoctorFormValues>;
  isLoading?: boolean;
  submitLabel?: string;
  compact?: boolean;
}

export function DoctorForm({
  onSubmit,
  defaultValues,
  isLoading,
  submitLabel = 'Salvar Medico',
  compact = false,
}: DoctorFormProps) {
  const form = useForm<DoctorFormValues>({
    resolver: zodResolver(doctorSchema),
    defaultValues: defaultValues || {},
  });

  const fields = (
    <div className="space-y-4">
      <FormField
        control={form.control}
        name="document"
        render={({ field }) => (
          <FormItem>
            <FormLabel>CPF</FormLabel>
            <FormControl>
              <ReactInputMask
                mask="999.999.999-99"
                value={field.value ?? ''}
                onChange={field.onChange}
                onBlur={field.onBlur}
              >
                {(inputProps: React.ComponentProps<'input'>) => (
                  <Input {...inputProps} ref={field.ref} placeholder="000.000.000-00" />
                )}
              </ReactInputMask>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <div className="grid grid-cols-2 gap-4">
        <FormField control={form.control} name="firstName" render={({ field }) => (
          <FormItem><FormLabel>Nome</FormLabel><FormControl>
            <Input placeholder="Nome" {...field} value={field.value ?? ''} />
          </FormControl><FormMessage /></FormItem>
        )} />
        <FormField control={form.control} name="lastName" render={({ field }) => (
          <FormItem><FormLabel>Sobrenome</FormLabel><FormControl>
            <Input placeholder="Sobrenome" {...field} value={field.value ?? ''} />
          </FormControl><FormMessage /></FormItem>
        )} />
      </div>
      <FormField control={form.control} name="email" render={({ field }) => (
        <FormItem><FormLabel>E-mail para Contato</FormLabel><FormControl>
          <Input type="email" placeholder="email@exemplo.com" {...field} value={field.value ?? ''} />
        </FormControl><FormMessage /></FormItem>
      )} />
      <div className="grid grid-cols-2 gap-4">
        <FormField control={form.control} name="crm" render={({ field }) => (
          <FormItem><FormLabel>Nº do CRM/CRO</FormLabel><FormControl>
            <Input placeholder="12345/SP" {...field} value={field.value ?? ''} />
          </FormControl><FormMessage /></FormItem>
        )} />
        <FormField control={form.control} name="mainSpecialty" render={({ field }) => (
          <FormItem><FormLabel>Especialidade</FormLabel><FormControl>
            <Input placeholder="ex: Oncologia" {...field} value={field.value ?? ''} />
          </FormControl><FormMessage /></FormItem>
        )} />
      </div>
      <div className="grid grid-cols-[80px_1fr] gap-4">
        <FormField control={form.control} name="state" render={({ field }) => (
          <FormItem><FormLabel>UF</FormLabel><FormControl>
            <Input placeholder="SP" maxLength={2} {...field} value={field.value ?? ''}
              onChange={(e) => field.onChange(e.target.value.toUpperCase())} />
          </FormControl><FormMessage /></FormItem>
        )} />
        <FormField control={form.control} name="city" render={({ field }) => (
          <FormItem><FormLabel>Município do Prescritor</FormLabel><FormControl>
            <Input placeholder="São Paulo" {...field} value={field.value ?? ''} />
          </FormControl><FormMessage /></FormItem>
        )} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <FormField control={form.control} name="phone" render={({ field }) => (
          <FormItem><FormLabel>Telefone Fixo</FormLabel><FormControl>
            <ReactInputMask mask="(99) 9999-9999" value={field.value ?? ''} onChange={field.onChange} onBlur={field.onBlur}>
              {(inputProps: React.ComponentProps<'input'>) => (
                <Input {...inputProps} ref={field.ref} placeholder="(00) 0000-0000" />
              )}
            </ReactInputMask>
          </FormControl><FormMessage /></FormItem>
        )} />
        <FormField control={form.control} name="mobilePhone" render={({ field }) => (
          <FormItem><FormLabel>Celular</FormLabel><FormControl>
            <ReactInputMask mask="(99) 99999-9999" value={field.value ?? ''} onChange={field.onChange} onBlur={field.onBlur}>
              {(inputProps: React.ComponentProps<'input'>) => (
                <Input {...inputProps} ref={field.ref} placeholder="(00) 00000-0000" />
              )}
            </ReactInputMask>
          </FormControl><FormMessage /></FormItem>
        )} />
      </div>
    </div>
  );

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {compact ? fields : (
          <Card>
            <CardHeader><CardTitle>Dados do Medico</CardTitle></CardHeader>
            <CardContent>{fields}</CardContent>
          </Card>
        )}
        <Button type="submit" disabled={isLoading} className="w-full">
          {isLoading ? 'Salvando...' : submitLabel}
        </Button>
      </form>
    </Form>
  );
}
