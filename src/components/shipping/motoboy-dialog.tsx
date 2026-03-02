'use client';

import { useState } from 'react';
import { useFirebase } from '@/firebase/provider';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { saveShippingRecord } from '@/services/shipping.service';
import type { ManualShippingStatus } from '@/types/shipping';
import type { Order, OrderCustomer, ShippingAddress } from '@/types';

interface MotoboyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: Order;
  customer: OrderCustomer | null;
  shippingAddress: ShippingAddress | null;
  onSuccess: () => void;
}

function AddressBlock({ address }: { address: ShippingAddress | null }) {
  if (!address) {
    return <p className="text-sm text-muted-foreground italic">Endereço não cadastrado</p>;
  }
  return (
    <div className="rounded-md bg-muted/50 p-3 text-sm space-y-0.5">
      <p className="font-medium">
        {address.street}, {address.number}
        {address.complement ? `, ${address.complement}` : ''}
      </p>
      <p className="text-muted-foreground">
        {address.neighborhood} — {address.city}/{address.state}
      </p>
      <p className="text-muted-foreground">CEP: {address.postalCode}</p>
    </div>
  );
}

const STATUS_LABELS: { value: ManualShippingStatus; label: string }[] = [
  { value: 'pending', label: 'Pendente' },
  { value: 'sent', label: 'Saiu para entrega' },
  { value: 'delivered', label: 'Entregue' },
  { value: 'returned', label: 'Não entregue / devolvido' },
];

export function MotoboyDialog({
  open,
  onOpenChange,
  order,
  customer,
  shippingAddress,
  onSuccess,
}: MotoboyDialogProps) {
  const { firestore, user } = useFirebase();

  // Form state
  const [cost, setCost] = useState('');
  const [sendDate, setSendDate] = useState('');
  const [notes, setNotes] = useState('');
  const [shippingStatus, setShippingStatus] = useState<ManualShippingStatus>('sent');

  // UI state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!firestore || !user) {
      setError('Serviço não disponível.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await saveShippingRecord(
        firestore,
        order.id,
        {
          method: 'MOTOBOY',
          cost: cost ? parseFloat(cost) : undefined,
          sendDate: sendDate || undefined,
          notes: notes.trim() || undefined,
          shippingStatus,
          tracking: '',
          price: cost ? parseFloat(cost) : 0,
          insurance: false,
          insuranceValue: 0,
          address: shippingAddress ?? undefined,
        },
        user.uid,
      );

      onSuccess();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao registrar envio');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Envio por Motoboy</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Destination address (read-only) */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground uppercase tracking-wide">
              Endereço de entrega
            </Label>
            <p className="text-sm font-medium">{customer?.name ?? '—'}</p>
            <AddressBlock address={shippingAddress} />
          </div>

          <Separator />

          {/* Cost + Send date */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Custo da entrega (R$)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                placeholder="0,00"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Data de saída</Label>
              <Input
                type="date"
                value={sendDate}
                onChange={(e) => setSendDate(e.target.value)}
              />
            </div>
          </div>

          {/* Status */}
          <div className="space-y-1.5">
            <Label>Status da entrega</Label>
            <Select
              value={shippingStatus}
              onValueChange={(v) => setShippingStatus(v as ManualShippingStatus)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_LABELS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label>Observações</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Instruções para o motoboy, ponto de referência, etc."
              rows={3}
            />
          </div>

          {error && (
            <p className="text-sm text-destructive rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? 'Registrando…' : 'Registrar envio'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
