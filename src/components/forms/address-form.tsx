'use client';

import { type Control, type FieldValues } from 'react-hook-form';
import ReactInputMask from 'react-input-mask';
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
  control: Control<any>;
  namePrefix?: string;
}

export function AddressForm({ control, namePrefix = 'address' }: AddressFormProps) {
  const fieldName = (name: string) => `${namePrefix}.${name}` as const;

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
                <ReactInputMask
                  mask="99999-999"
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                >
                  {(inputProps: React.ComponentProps<'input'>) => (
                    <Input {...inputProps} ref={field.ref} placeholder="00000-000" />
                  )}
                </ReactInputMask>
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
