'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import ReactInputMask from 'react-input-mask';
import { customerSchema, type CustomerFormValues } from '@/types/forms';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { AddressForm } from '@/components/forms/address-form';

interface CustomerFormProps {
  onSubmit: (data: CustomerFormValues) => void | Promise<void>;
  defaultValues?: Partial<CustomerFormValues>;
  isLoading?: boolean;
  submitLabel?: string;
}

export function CustomerForm({
  onSubmit,
  defaultValues,
  isLoading,
  submitLabel = 'Salvar Cliente',
}: CustomerFormProps) {
  const [showAddress, setShowAddress] = useState(
    !!defaultValues?.address
  );

  const form = useForm<CustomerFormValues>({
    resolver: zodResolver(customerSchema),
    defaultValues: defaultValues || {},
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Dados do Cliente</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* CPF/CNPJ */}
            <FormField
              control={form.control}
              name="document"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>CPF/CNPJ</FormLabel>
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

            {/* RG */}
            <FormField
              control={form.control}
              name="rg"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nº do Documento de Identificação (RG)</FormLabel>
                  <FormControl>
                    <Input placeholder="12.345.678-9" {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              {/* First Name */}
              <FormField
                control={form.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome</FormLabel>
                    <FormControl>
                      <Input placeholder="Nome" {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Last Name */}
              <FormField
                control={form.control}
                name="lastName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sobrenome</FormLabel>
                    <FormControl>
                      <Input placeholder="Sobrenome" {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Email */}
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>E-mail</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="email@exemplo.com"
                        {...field}
                        value={field.value ?? ''}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Phone */}
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Celular</FormLabel>
                    <FormControl>
                      <ReactInputMask
                        mask="(99) 99999-9999"
                        value={field.value ?? ''}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                      >
                        {(inputProps: React.ComponentProps<'input'>) => (
                          <Input {...inputProps} ref={field.ref} placeholder="(00) 00000-0000" />
                        )}
                      </ReactInputMask>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Birth Date */}
            <FormField
              control={form.control}
              name="birthDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Data de Nascimento</FormLabel>
                  <FormControl>
                    <Input
                      type="date"
                      {...field}
                      value={
                        field.value instanceof Date
                          ? field.value.toISOString().split('T')[0]
                          : field.value ?? ''
                      }
                      onChange={(e) => {
                        const val = e.target.value;
                        field.onChange(val ? new Date(val) : undefined);
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Collapsible Address Section */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Endereco</CardTitle>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowAddress(!showAddress)}
              >
                {showAddress ? 'Ocultar' : 'Adicionar Endereco'}
              </Button>
            </div>
          </CardHeader>
          {showAddress && (
            <CardContent>
              <AddressForm control={form.control} namePrefix="address" />
            </CardContent>
          )}
        </Card>

        <Button type="submit" disabled={isLoading} className="w-full">
          {isLoading ? 'Salvando...' : submitLabel}
        </Button>
      </form>
    </Form>
  );
}
