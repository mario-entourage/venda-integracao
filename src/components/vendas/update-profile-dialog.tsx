'use client';

import React, { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export interface FieldChange {
  key: string;
  label: string;
  currentValue: string;
  newValue: string;
  /** If true, current is empty — safer to auto-apply */
  wasEmpty: boolean;
}

interface UpdateProfileDialogProps {
  open: boolean;
  onClose: () => void;
  onApply: (selectedKeys: string[]) => Promise<void>;
  entityLabel: string; // e.g. "Paciente: João Silva"
  changes: FieldChange[];
}

export function UpdateProfileDialog({
  open,
  onClose,
  onApply,
  entityLabel,
  changes,
}: UpdateProfileDialogProps) {
  // Pre-check all by default
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(changes.map((c) => c.key)),
  );
  const [isApplying, setIsApplying] = useState(false);

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleApply = async () => {
    setIsApplying(true);
    try {
      await onApply([...selected]);
      onClose();
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Atualizar Cadastro</DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            O documento enviado contém informações sobre <strong>{entityLabel}</strong>.
            Selecione quais campos deseja atualizar no cadastro:
          </p>
        </DialogHeader>

        <div className="space-y-2 max-h-72 overflow-y-auto py-1">
          {changes.map((change) => (
            <div
              key={change.key}
              className={cn(
                'flex items-start gap-3 rounded-lg border p-3 transition-colors',
                selected.has(change.key) ? 'border-primary/40 bg-primary/5' : 'border-border',
              )}
            >
              <Checkbox
                id={`field-${change.key}`}
                checked={selected.has(change.key)}
                onCheckedChange={() => toggle(change.key)}
                className="mt-0.5"
              />
              <div className="flex-1 min-w-0">
                <Label htmlFor={`field-${change.key}`} className="text-sm font-medium cursor-pointer">
                  {change.label}
                </Label>
                <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                  <span className="line-through opacity-60">
                    {change.currentValue || '(vazio)'}
                  </span>
                  <span>→</span>
                  <span className="font-medium text-foreground">{change.newValue}</span>
                  {change.wasEmpty && (
                    <Badge variant="outline" className="text-[10px] border-green-300 text-green-700 bg-green-50">
                      Novo
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={isApplying}>
            Ignorar
          </Button>
          <Button onClick={handleApply} disabled={selected.size === 0 || isApplying}>
            {isApplying ? 'Atualizando...' : `Atualizar ${selected.size} campo(s)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
