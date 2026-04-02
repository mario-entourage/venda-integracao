'use client';

import { useState, useCallback } from 'react';
import { type Control, useFormContext } from 'react-hook-form';
import { Loader2 } from 'lucide-react';
import { MaskedInput } from '@/components/shared/masked-input';
import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { BRAZILIAN_STATES } from '@/lib/constants';

interface AddressFormProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: Control<any>;
  namePrefix?: string;
}

export function AddressForm({ control, namePrefix = 'address' }: AddressFormProps) {
  const fieldName = (name: string) => `${namePrefix}.${name}`;
  const form = useFormContext();
  const [cepLoading, setCepLoading] = useState(false);

  const handleCepBlur = useCallback(async (rawValue: string) => {
    const digits = rawValue.replace(/\D/g, '');
    if (digits.length !== 8) return;

    setCepLoading(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.erro) return;

      if (data.logradouro) form.setValue(fieldName('street'), data.logradouro);
      if (data.bairro) form.setValue(fieldName('neighborhood'), data.bairro);
      if (data.localidade) form.setValue(fieldName('city'), data.localidade);
      if (data.uf) form.setValue(fieldName('state'), data.uf);
    } catch {
      // Graceful degradation — allow manual entry
    } finally {
      setCepLoading(false);
    }
  }, [form, fieldName]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        {/* CEP */}
        <FormField
          control={control}
          name={fieldName('postalCode')}
          render={({ field }) => (
            <FormItem>
              <FormLabel>CEP</FormLabel>
              <FormControl>
                <div className="relative">
                  <MaskedInput
                    ref={field.ref}
                    mask="99999-999"
                    value={field.value ?? ''}
                    onChange={field.onChange}
                    onBlur={(e) => {
                      field.onBlur();
                      handleCepBlur(e.target.value);
                    }}
                    placeholder="00000-000"
                  />
                  {cepLoading && (
                    <Loader2 className="absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                  )}
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Street */}
        <FormField
          control={control}
          name={fieldName('street')}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Rua</FormLabel>
              <FormControl>
                <Input placeholder="Nome da rua" {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Number */}
        <FormField
          control={control}
          name={fieldName('number')}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Numero</FormLabel>
              <FormControl>
                <Input placeholder="123" {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Complement */}
        <FormField
          control={control}
          name={fieldName('complement')}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Complemento</FormLabel>
              <FormControl>
                <Input placeholder="Apto, bloco, etc." {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Neighborhood */}
        <FormField
          control={control}
          name={fieldName('neighborhood')}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Bairro</FormLabel>
              <FormControl>
                <Input placeholder="Bairro" {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* City */}
        <FormField
          control={control}
          name={fieldName('city')}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Cidade</FormLabel>
              <FormControl>
                <Input placeholder="Cidade" {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* State */}
        <FormField
          control={control}
          name={fieldName('state')}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Estado</FormLabel>
              <Select onValueChange={field.onChange} value={field.value ?? ''}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o estado" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {BRAZILIAN_STATES.map((uf) => (
                    <SelectItem key={uf} value={uf}>
                      {uf}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Country (hidden, defaults to BR) */}
        <FormField
          control={control}
          name={fieldName('country')}
          render={({ field }) => (
            <input type="hidden" {...field} value={field.value ?? 'BR'} />
          )}
        />
      </div>
    </div>
  );
}
