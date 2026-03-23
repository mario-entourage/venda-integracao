'use client';

import { useState } from 'react';
import { friendlyError } from '@/lib/friendly-error';
import { useFirebase } from '@/firebase/provider';
import { useAuthFetch } from '@/hooks/use-auth-fetch';
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
  type TriStarDialogPayload,
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

// ---------------------------------------------------------------------------
// Item line state
// ---------------------------------------------------------------------------

interface ItemLine {
  id: string;
  shipmentItemType: TriStarItemTypeValue;
  description: string;
  quantity: string;
  unitPrice: string;
  anvisaAuthNumber: string;
  anvisaCommercialName: string;
}

function makeEmptyItem(overrides?: Partial<ItemLine>): ItemLine {
  return {
    id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    shipmentItemType: 30,
    description: '',
    quantity: '1',
    unitPrice: '0',
    anvisaAuthNumber: '',
    anvisaCommercialName: '',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Main dialog
// ---------------------------------------------------------------------------

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
  const authFetch = useAuthFetch();

  // Item list state — starts with one item pre-filled with the order amount
  const [items, setItems] = useState<ItemLine[]>(() => [
    makeEmptyItem({ unitPrice: String(order.amount ?? 0) }),
  ]);

  // Optional recipient contact (not always stored on OrderCustomer)
  const [toPhone, setToPhone] = useState('');
  const [toEmail, setToEmail] = useState('');

  // Insurance
  const [withInsurance, setWithInsurance] = useState(false);
  const [insuranceValue, setInsuranceValue] = useState('0');

  // UI state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successData, setSuccessData] = useState<TriStarShipmentResponse | null>(null);

  // ---------------------------------------------------------------------------
  // Item mutations
  // ---------------------------------------------------------------------------

  const updateItem = (id: string, patch: Partial<Omit<ItemLine, 'id'>>) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const addItem = () => setItems((prev) => [...prev, makeEmptyItem()]);

  const removeItem = (id: string) => {
    setItems((prev) => {
      if (prev.length <= 1) return prev; // always keep at least one item
      return prev.filter((item) => item.id !== id);
    });
  };

  // ---------------------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------------------

  const handleSubmit = async () => {
    if (!firestore || !user || !customer || !shippingAddress) {
      setError('Dados necessários não disponíveis.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const postalCode = shippingAddress.postalCode.replace(/\D/g, '');

      const payload: TriStarDialogPayload = {
        to_name: customer.name,
        to_document: customer.document.replace(/\D/g, ''),
        to_address: shippingAddress.street,
        to_number: shippingAddress.number,
        to_complement: shippingAddress.complement || undefined,
        to_neighborhood: shippingAddress.neighborhood,
        to_city: shippingAddress.city,
        to_state: shippingAddress.state,
        to_country: shippingAddress.country || 'BR',
        to_postcode: postalCode,
        to_phone: toPhone.trim() || undefined,
        to_email: toEmail.trim() || undefined,
        items: items.map((item) => ({
          shipment_item_type: item.shipmentItemType,
          description: item.description.trim(),
          quantity: parseInt(item.quantity, 10) || 1,
          unit_price: parseFloat(item.unitPrice) || 0,
          ...(item.shipmentItemType === 40 && {
            anvisa_import_authorization_number: item.anvisaAuthNumber || undefined,
            anvisa_product_commercial_name: item.anvisaCommercialName || undefined,
          }),
        })),
        with_insurance: withInsurance,
        insurance_value: withInsurance ? parseFloat(insuranceValue) || 0 : undefined,
      };

      const res = await authFetch(SHIPPING_API_ROUTES.createShipment, {
        method: 'POST',
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
          insurance: withInsurance,
          insuranceValue: withInsurance ? parseFloat(insuranceValue) || 0 : 0,
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
        const tkn = await user?.getIdToken().catch(() => undefined);
        notifyShipmentTracking(firestore, {
          recipientUserId: repUserId,
          recipientEmail: repEmail,
          orderId: order.id,
          trackingCode: responseData.tracking_code,
          invoiceNumber: repInvoice,
          idToken: tkn,
        }).catch(() => {});
      }

      setSuccessData(responseData);
      onSuccess();
    } catch (err) {
      setError(friendlyError(err, 'Erro ao criar remessa.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setSuccessData(null);
    setError(null);
    onOpenChange(false);
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
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

              {/* Optional recipient contact */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Telefone dest. (opcional)</Label>
                  <Input
                    placeholder="+55 11 99999-9999"
                    value={toPhone}
                    onChange={(e) => setToPhone(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Email dest. (opcional)</Label>
                  <Input
                    type="email"
                    placeholder="paciente@email.com"
                    value={toEmail}
                    onChange={(e) => setToEmail(e.target.value)}
                  />
                </div>
              </div>

              <Separator />

              {/* Items */}
              <div className="space-y-3">
                <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                  Itens da remessa
                </Label>

                {items.map((item, index) => (
                  <div key={item.id} className="rounded-md border p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-muted-foreground">
                        Item {index + 1}
                      </span>
                      {items.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-destructive hover:text-destructive"
                          onClick={() => removeItem(item.id)}
                        >
                          × Remover
                        </Button>
                      )}
                    </div>

                    {/* Type */}
                    <div className="space-y-1.5">
                      <Label className="text-xs">Tipo de produto</Label>
                      <Select
                        value={String(item.shipmentItemType)}
                        onValueChange={(v) =>
                          updateItem(item.id, {
                            shipmentItemType: parseInt(v, 10) as TriStarItemTypeValue,
                          })
                        }
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

                    {/* Description */}
                    <div className="space-y-1.5">
                      <Label className="text-xs">Descrição do item</Label>
                      <Input
                        placeholder="Ex: CBD 3500mg — Uso Médico"
                        value={item.description}
                        onChange={(e) => updateItem(item.id, { description: e.target.value })}
                      />
                    </div>

                    {/* Quantity + unit price */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Quantidade</Label>
                        <Input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => updateItem(item.id, { quantity: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Valor unitário (R$)</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.unitPrice}
                          onChange={(e) => updateItem(item.id, { unitPrice: e.target.value })}
                        />
                      </div>
                    </div>

                    {/* ANVISA fields (only for CBD, type 40) */}
                    {item.shipmentItemType === 40 && (
                      <>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Nº autorização ANVISA</Label>
                          <Input
                            value={item.anvisaAuthNumber}
                            onChange={(e) =>
                              updateItem(item.id, { anvisaAuthNumber: e.target.value })
                            }
                            placeholder="Ex: 12345/2024"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Nome comercial (ANVISA)</Label>
                          <Input
                            value={item.anvisaCommercialName}
                            onChange={(e) =>
                              updateItem(item.id, { anvisaCommercialName: e.target.value })
                            }
                            placeholder="Nome conforme registro ANVISA"
                          />
                        </div>
                      </>
                    )}
                  </div>
                ))}

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={addItem}
                >
                  + Adicionar item
                </Button>
              </div>

              <Separator />

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
                  checked={withInsurance}
                  onCheckedChange={setWithInsurance}
                />
              </div>
              {withInsurance && (
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
              <Button
                onClick={handleSubmit}
                disabled={isSubmitting || !customer || !shippingAddress}
              >
                {isSubmitting ? 'Criando remessa…' : 'Criar remessa TriStar'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
