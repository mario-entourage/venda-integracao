'use client';

import React, { useCallback } from 'react';
import { Input } from '@/components/ui/input';

interface MaskedInputProps extends Omit<React.ComponentProps<'input'>, 'onChange'> {
  mask: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
}

/**
 * Simple masked input that replaces react-input-mask (incompatible with React 19).
 * Mask chars: '9' = digit, 'a' = letter, '*' = any.
 * All other chars are literal separators inserted automatically.
 */
export const MaskedInput = React.forwardRef<HTMLInputElement, MaskedInputProps>(
  ({ mask, value, onChange, onBlur, placeholder, ...rest }, ref) => {
    const applyMask = useCallback(
      (raw: string): string => {
        const digits = raw.replace(/\D/g, '');
        let result = '';
        let di = 0;
        for (let i = 0; i < mask.length && di < digits.length; i++) {
          if (mask[i] === '9') {
            result += digits[di++];
          } else {
            result += mask[i];
            // If the user typed the separator char, skip it in digits
            if (digits[di] === mask[i]) di++;
          }
        }
        return result;
      },
      [mask],
    );

    const handleChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const masked = applyMask(e.target.value);
        // Create a synthetic-like event with the masked value
        const syntheticEvent = {
          ...e,
          target: { ...e.target, value: masked },
        } as React.ChangeEvent<HTMLInputElement>;
        onChange(syntheticEvent);
      },
      [applyMask, onChange],
    );

    return (
      <Input
        ref={ref}
        value={value}
        onChange={handleChange}
        onBlur={onBlur}
        placeholder={placeholder}
        {...rest}
      />
    );
  },
);

MaskedInput.displayName = 'MaskedInput';
