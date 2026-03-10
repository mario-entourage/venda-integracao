'use client';

import { useState } from 'react';
import { useFirebase } from '@/firebase/provider';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { saveShippingRecord, deductInventoryOnShip } from '@/services/shipping.service';
import { notifyShipmentTracking } from '@/services/notifications.service';
import { SHIPPING_API_ROUTES } from '@/lib/shipping-routes';
import {
  TRISTAR_ITEM_TYPES,
  type TriStarItemTypeValue,
  type TriStarCreateShipmentRequest,
  type TriStarShipmentResponse,
} from '@/types/shipping';
import type { Order, OrderCustomer, ShippingAddress } from '@/types';

interface TriStarDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: Order;
  customer: OrderCustomer | null;
  shippingAddress: ShippingAddress | null;
  onSuccess: () => void;
  /** If provided, sends the rep an in-app + email notification with the tracking code */
  repUserId?: string;
  repEmail?: string;
  repInvoice?: string;
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

export function TriStarDialog({
  open,
  onOpenChange,
  order,
  customer,
  shippingAddress,
  onSuccess,
  repUserId,
  repEmail,
  repInvoice,
}: TriStarDialogProps) {
  const { firestore, user } = useFirebase();

  // Form state
  const [itemType, setItemType] = useState<TriStarItemTypeValue>(30);
  const [quantity, setQuantity] = useState('1');
  const [value, setValue] = useState(String(order.amount ?? 0));
  const [anvisaAuthNumber, setAnvisaAuthNumber] = useState('');
  const [anvisaCommercialName, setAnvisaCommercialName] = useState('');
  const [insurance, setInsurance] = useState(false);
  const [insuranceValue, setInsuranceValue] = useState('0');

  // UI state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successData, setSuccessData] = useState<TriStarShipmentResponse | null>(null);

  const isCbd = itemType === 40;

  const handleSubmit = async () => {
    if (!firestore || !user || !customer || !shippingAddress) {
      setError('Dados necessários não disponíveis.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const postalCode = shippingAddress.postalCode.replace(/\D/g, '');

      const payload: TriStarCreateShipmentRequest = {
        recipient: {
          name: customer.name,
          document: customer.document.replace(/\D/g, ''),
          address: {
            street: shippingAddress.street,
            number: shippingAddress.number,
            complement: shippingAddress.complement,
            neighborhood: shippingAddress.neighborhood,
            city: shippingAddress.city,
            state: shippingAddress.state,
            country: shippingAddress.country || 'BR',
            postal_code: postalCode,
          },
        },
        items: [
          {
            type: itemType,
            quantity: parseInt(quantity, 10) || 1,
            value: parseFloat(value) || 0,
            ...(isCbd && {
              anvisa_import_authorization_number: anvisaAuthNumber,
              anvisa_product_commercial_name: anvisaCommercialName,
            }),
          },
        ],
        insurance,
        insurance_value: insurance ? parseFloat(insuranceValue) || 0 : 0,
      };

      const res = await fetch(SHIPPING_API_ROUTES.createShipment, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Erro HTTP ${res.status}`);
      }

      const responseData: TriStarShipmentResponse = await res.json();

      // Save the shipping record to Firestore and update order status
      await saveShippingRecord(
        firestore,
        order.id,
        {
          method: 'TRISTAR',
          tristarShipmentId: responseData.id,
          tristarStatus: responseData.status,
          tristarTrackingCode: responseData.tracking_code,
          tristarLabelUrl: responseData.label_url,
          insurance,
          insuranceValue: insurance ? parseFloat(insuranceValue) || 0 : 0,
          price: 0,
          address: shippingAddress,
        },
        user.uid,
      );

      // Deduct inventory from Miami stock (fire-and-forget)
      if (firestore) {
        deductInventoryOnShip(firestore, order.id, 'TRISTAR').catch((e) =>
          console.warn('[TriStarDialog] inventory deduction failed:', e),
        );
      }

      // Notify rep with tracking code (fire-and-forget)
      if (firestore && repUserId && repEmail && responseData.tracking_code) {
        notifyShipmentTracking(firestore, {
          recipientUserId: repUserId,
          recipientEmail: repEmail,
          orderId: order.id,
          trackingCode: responseData.tracking_code,
          invoiceNumber: repInvoice,
        }).catch(() => {});
      }

      setSuccessData(responseData);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar remessa');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setSuccessData(null);
    setError(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Envio via TriStar Express</DialogTitle>
        </DialogHeader>

        {successData ? (
          /* ── Success state ─────────────────────────────────────── */
          <div className="space-y-4 py-2">
            <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm space-y-2">
              <p className="font-semibold text-green-800">Remessa criada com sucesso!</p>
              {successData.tracking_code && (
                <p>
                  <span className="text-muted-foreground">Código de rastreio: </span>
                  <span className="font-mono font-medium">{successData.tracking_code}</span>
                </p>
              )}
              <p>
                <span className="text-muted-foreground">ID TriStar: </span>
                <span className="font-mono">{successData.id}</span>
              </p>
            </div>
            {successData.label_url && (
              <a
                href={successData.label_url}
                target="_blank"
                rel="noopener noreferrer"
                className="block"
              >
                <Button variant="outline" className="w-full">
                  📄 Baixar etiqueta
                </Button>
              </a>
            )}
            <Button className="w-full" onClick={handleClose}>
              Fechar
            </Button>
          </div>
        ) : (
          /* ── Form ──────────────────────────────────────────────── */
          <>
            <div className="space-y-4 py-2">
              {/* Recipient address */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                  Destinatário
                </Label>
                <p className="text-sm font-medium">{customer?.name ?? '—'}</p>
                <p className="text-sm text-muted-foreground">CPF: {customer?.document ?? '—'}</p>
                <AddressBlock address={shippingAddress} />
              </div>

              <Separator />

              {/* Item type */}
              <div className="space-y-1.5">
                <Label>Tipo de produto</Label>
                <Select
                  value={String(itemType)}
                  onValueChange={(v) => setItemType(parseInt(v, 10) as TriStarItemTypeValue)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TRISTAR_ITEM_TYPES.map((t) => (
                      <SelectItem key={t.value} value={String(t.value)}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Quantity + value */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Quantidade</Label>
                  <Input
                    type="number"
                    min="1"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Valor declarado (R$)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                  />
                </div>
              </div>

              {/* ANVISA fields (only for CBD) */}
              {isCbd && (
                <>
                  <div className="space-y-1.5">
                    <Label>Nº autorização ANVISA</Label>
                    <Input
                      value={anvisaAuthNumber}
                      onChange={(e) => setAnvisaAuthNumber(e.target.value)}
                      placeholder="Ex: 12345/2024"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Nome comercial do produto (ANVISA)</Label>
                    <Input
                      value={anvisaCommercialName}
                      onChange={(e) => setAnvisaCommercialName(e.target.value)}
                      placeholder="Nome conforme registro ANVISA"
                    />
                  </div>
                </>
              )}

              {/* Insurance */}
              <div className="flex items-center justify-between rounded-md border px-3 py-2">
                <div>
                  <Label htmlFor="insurance-toggle">Seguro de carga</Label>
                  <p className="text-xs text-muted-foreground">
                    Protege contra perda ou dano
                  </p>
                </div>
                <Switch
                  id="insurance-toggle"
                  checked={insurance}
                  onCheckedChange={setInsurance}
                />
              </div>
              {insurance && (
                <div className="space-y-1.5">
                  <Label>Valor do seguro (R$)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={insuranceValue}
                    onChange={(e) => setInsuranceValue(e.target.value)}
                  />
                </div>
              )}

              {error && (
                <p className="text-sm text-destructive rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2">
                  {error}
                </p>
              )}
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={handleClose} disabled={isSubmitting}>
                Cancelar
              </Button>
              <Button onClick={handleSubmit} disabled={isSubmitting || !customer || !shippingAddress}>
                {isSubmitting ? 'Criando remessa…' : 'Criar remessa TriStar'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
