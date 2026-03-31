'use client';

import { useState } from 'react';
import { mergeClients } from '@/server/actions/merge-clients.actions';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import type { Client } from '@/types/client';

interface MergeClientsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clients: (Client & { id: string })[];
  /** Pre-selected client to be merged away (the duplicate). */
  initialDuplicateId?: string;
  onMerged: () => void;
}

export function MergeClientsDialog({
  open,
  onOpenChange,
  clients,
  initialDuplicateId,
  onMerged,
}: MergeClientsDialogProps) {
  const { toast } = useToast();
  const [primaryId, setPrimaryId] = useState('');
  const [duplicateId, setDuplicateId] = useState(initialDuplicateId ?? '');
  const [loading, setLoading] = useState(false);

  const primaryClient = clients.find((c) => c.id === primaryId);
  const duplicateClient = clients.find((c) => c.id === duplicateId);

  const canSubmit = primaryId && duplicateId && primaryId !== duplicateId;

  const handleMerge = async () => {
    if (!canSubmit) return;
    setLoading(true);
    try {
      const result = await mergeClients(primaryId, duplicateId);
      toast({
        title: 'Clientes mesclados',
        description: `${result.ordersUpdated} pedido(s) e ${result.documentsUpdated} documento(s) atualizados.`,
      });
      onMerged();
      onOpenChange(false);
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Erro ao mesclar',
        description: err instanceof Error ? err.message : 'Tente novamente.',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Mesclar Clientes</DialogTitle>
          <DialogDescription>
            Todos os pedidos e documentos do cliente duplicado serão transferidos para o cliente
            principal. O duplicado será desativado.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Cliente principal (manter)</p>
            <Select value={primaryId} onValueChange={setPrimaryId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecionar cliente principal..." />
              </SelectTrigger>
              <SelectContent>
                {clients
                  .filter((c) => c.id !== duplicateId)
                  .map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.fullName}
                      {c.document ? ` — ${c.document}` : ''}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <p className="text-sm font-medium">Cliente duplicado (remover)</p>
            <Select value={duplicateId} onValueChange={setDuplicateId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecionar duplicado..." />
              </SelectTrigger>
              <SelectContent>
                {clients
                  .filter((c) => c.id !== primaryId)
                  .map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.fullName}
                      {c.document ? ` — ${c.document}` : ''}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          {canSubmit && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <strong>{duplicateClient?.fullName}</strong> será desativado e todos os seus registros
              serão transferidos para <strong>{primaryClient?.fullName}</strong>. Esta ação não pode
              ser desfeita.
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={handleMerge}
            disabled={!canSubmit || loading}
          >
            {loading ? 'Mesclando...' : 'Mesclar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
