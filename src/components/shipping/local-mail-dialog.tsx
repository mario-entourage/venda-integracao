'use client';

import { useState } from 'react';
import { friendlyError } from '@/lib/friendly-error';
import { useFirebase } from '@/firebase/provider';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { saveShippingRecord } from '@/services/shipping.service';
import type { ManualShippingStatus } from '@/types/shipping';
import type { Order, OrderCustomer, ShippingAddress } from '@/types';

interface LocalMailDialogProps {
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
  { value: 'pending', label: 'Envio Pendiente' },
  { value: 'sent', label: 'Envio Realizado' },
  { value: 'received', label: 'Recebido' },
  { value: 'lost', label: 'Extraviado' },
  { value: 'suspended', label: 'Entrega Suspensa' },
  { value: 'returned', label: 'Devolvido ao Remetente' },
];

export function LocalMailDialog({
  open,
  onOpenChange,
  order,
  customer,
  shippingAddress,
  onSuccess,
}: LocalMailDialogProps) {
  const { firestore, user } = useFirebase();

  // Form state
  const [shipper, setShipper] = useState('');
  const [carrier, setCarrier] = useState('Correios');
  const [cost, setCost] = useState('');
  const [sendDate, setSendDate] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
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
          method: 'LOCAL_MAIL',
          shipper: shipper.trim() || undefined,
          carrier: carrier.trim() || 'Correios',
          cost: cost ? parseFloat(cost) : undefined,
          sendDate: sendDate || undefined,
          tracking: trackingNumber.trim(),
          trackingNumber: trackingNumber.trim() || undefined,
          shippingStatus,
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
      setError(friendlyError(err, 'Erro ao registrar envio.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Envio por Correios</DialogTitle>
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

          {/* Shipper */}
          <div className="space-y-1.5">
            <Label>Remetente (quem envia)</Label>
            <Input
              value={shipper}
              onChange={(e) => setShipper(e.target.value)}
              placeholder="Ex: Entourage Phytolab"
            />
          </div>

          {/* Carrier */}
          <div className="space-y-1.5">
            <Label>Transportadora / Serviço</Label>
            <Input
              value={carrier}
              onChange={(e) => setCarrier(e.target.value)}
              placeholder="Ex: Sedex, PAC, Correios"
            />
          </div>

          {/* Cost + Send date */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Custo do envio (R$)</Label>
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
              <Label>Data de envio</Label>
              <Input
                type="date"
                value={sendDate}
                onChange={(e) => setSendDate(e.target.value)}
              />
            </div>
          </div>

          {/* Tracking number */}
          <div className="space-y-1.5">
            <Label>Código de rastreio</Label>
            <Input
              value={trackingNumber}
              onChange={(e) => setTrackingNumber(e.target.value)}
              placeholder="Ex: AA123456789BR"
              className="font-mono"
            />
          </div>

          {/* Status */}
          <div className="space-y-1.5">
            <Label>Status do envio</Label>
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
