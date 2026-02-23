import React from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface StatusBadgeProps {
  status: string;
  labels: Record<string, string>;
  className?: string;
}

function getVariantAndClass(status: string): {
  variant: 'default' | 'secondary' | 'destructive' | 'outline';
  extraClass?: string;
} {
  const s = status.toLowerCase();

  if (['pending', 'created', 'draft'].some((kw) => s.includes(kw))) {
    return { variant: 'outline' };
  }

  if (['processing', 'awaiting', 'progress'].some((kw) => s.includes(kw))) {
    return { variant: 'secondary' };
  }

  if (
    ['paid', 'approved', 'delivered', 'received', 'complete', 'active'].some(
      (kw) => s.includes(kw)
    )
  ) {
    return {
      variant: 'default',
      extraClass: 'bg-green-600 hover:bg-green-600/80 text-white',
    };
  }

  if (
    ['cancelled', 'failed', 'rejected', 'falta'].some((kw) => s.includes(kw))
  ) {
    return { variant: 'destructive' };
  }

  return { variant: 'secondary' };
}

export function StatusBadge({ status, labels, className }: StatusBadgeProps) {
  const { variant, extraClass } = getVariantAndClass(status);
  const label = labels[status] ?? status;

  return (
    <Badge variant={variant} className={cn(extraClass, className)}>
      {label}
    </Badge>
  );
}
