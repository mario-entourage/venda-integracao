'use client';

import React, { useState } from 'react';
import { Plane, Mail, Bike } from 'lucide-react';
import type { Timestamp } from 'firebase/firestore';
import { Card, CardContent } from '@/components/ui/card';
import { TriStarDialog } from '@/components/shipping/tristar-dialog';
import { LocalMailDialog } from '@/components/shipping/local-mail-dialog';
import { MotoboyDialog } from '@/components/shipping/motoboy-dialog';
import type { Order, OrderCustomer, ShippingAddress } from '@/types';
import type { ClientAddress } from '@/types/client';
import { OrderStatus, OrderType } from '@/types/enums';

// ─── types ────────────────────────────────────────────────────────────────────

type OpenDialog = 'tristar' | 'local_mail' | 'motoboy' | null;

interface StepEnvioProps {
  orderId: string;
  orderAmount: number;
  clientName: string;
  clientDocument: string;
  /** The client's address from the Firestore `clients` collection, used to pre-fill the shipping address. */
  clientAddress?: ClientAddress;
  repUserId?: string;
  repEmail?: string;
  /** Invoice number (e.g. "ETGA CA 00001") to include in the rep's notification. */
  repInvoice?: string;
}

// ─── component ────────────────────────────────────────────────────────────────

export function StepEnvio({
  orderId,
  orderAmount,
  clientName,
  clientDocument,
  clientAddress,
  repUserId,
  repEmail,
  repInvoice,
}: StepEnvioProps) {
  const [openDialog, setOpenDialog] = useState<OpenDialog>(null);
  const [shipped, setShipped] = useState(false);

  // Build a minimal Order object for the shipping dialogs.
  // Timestamps and non-essential fields are stubbed — dialogs only use id + amount.
  const orderForDialog: Order = {
    id: orderId,
    amount: orderAmount,
    status: OrderStatus.PROCESSING,
    invoice: '',
    legalGuardian: false,
    currency: 'BRL',
    discount: 0,
    type: OrderType.SALE,
    documentsComplete: false,
    createdById: '',
    createdAt: {} as Timestamp,
    updatedAt: {} as Timestamp,
  };

  // Build a minimal OrderCustomer object for the shipping dialogs
  const customerForDialog: OrderCustomer = {
    id: '',
    name: clientName,
    document: clientDocument,
    orderId,
    userId: '',
    createdAt: {} as Timestamp,
    updatedAt: {} as Timestamp,
  };

  // Convert ClientAddress → ShippingAddress (structures are identical)
  const shippingAddress: ShippingAddress | null = clientAddress
    ? {
        street: clientAddress.street,
        number: clientAddress.number,
        complement: clientAddress.complement,
        neighborhood: clientAddress.neighborhood,
        city: clientAddress.city,
        state: clientAddress.state,
        country: clientAddress.country || 'BR',
        postalCode: clientAddress.postalCode,
      }
    : null;

  const handleShipSuccess = () => {
    setShipped(true);
    setOpenDialog(null);
  };

  if (shipped) {
    return (
      <div className="text-center py-10 space-y-3">
        <p className="text-4xl">✅</p>
        <p className="text-lg font-semibold">Envio registrado com sucesso!</p>
        <p className="text-sm text-muted-foreground">
          Acompanhe o status do envio na página do pedido.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-base font-semibold mb-1">Como será enviado?</h3>
        <p className="text-sm text-muted-foreground">
          Selecione o método de envio para registrar a expedição.{' '}
          {!shippingAddress && (
            <span className="text-amber-600">
              Nenhum endereço cadastrado para este cliente.
            </span>
          )}
        </p>
      </div>

      {/* Method cards */}
      <div className="grid gap-3 sm:grid-cols-3">
        {/* TriStar Express */}
        <Card
          className="cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors"
          onClick={() => setOpenDialog('tristar')}
        >
          <CardContent className="pt-5 pb-4 flex flex-col items-center text-center gap-2">
            <Plane className="h-7 w-7 text-primary" />
            <p className="font-semibold">TriStar Express</p>
            <p className="text-xs text-muted-foreground">
              Envio internacional do estoque de Miami
            </p>
          </CardContent>
        </Card>

        {/* Correios / Local Mail */}
        <Card
          className="cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors"
          onClick={() => setOpenDialog('local_mail')}
        >
          <CardContent className="pt-5 pb-4 flex flex-col items-center text-center gap-2">
            <Mail className="h-7 w-7 text-primary" />
            <p className="font-semibold">Correios / Local</p>
            <p className="text-xs text-muted-foreground">
              Postagem via Correios ou outra transportadora
            </p>
          </CardContent>
        </Card>

        {/* Motoboy */}
        <Card
          className="cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors"
          onClick={() => setOpenDialog('motoboy')}
        >
          <CardContent className="pt-5 pb-4 flex flex-col items-center text-center gap-2">
            <Bike className="h-7 w-7 text-primary" />
            <p className="font-semibold">Motoboy</p>
            <p className="text-xs text-muted-foreground">
              Entrega local por motoboy
            </p>
          </CardContent>
        </Card>
      </div>

      <p className="text-xs text-muted-foreground text-center">
        Você também pode registrar o envio mais tarde na página do pedido.
      </p>

      {/* Shipping dialogs */}
      <TriStarDialog
        open={openDialog === 'tristar'}
        onOpenChange={(o) => !o && setOpenDialog(null)}
        order={orderForDialog}
        customer={customerForDialog}
        shippingAddress={shippingAddress}
        onSuccess={handleShipSuccess}
        repUserId={repUserId}
        repEmail={repEmail}
        repInvoice={repInvoice}
      />
      <LocalMailDialog
        open={openDialog === 'local_mail'}
        onOpenChange={(o) => !o && setOpenDialog(null)}
        order={orderForDialog}
        customer={customerForDialog}
        shippingAddress={shippingAddress}
        onSuccess={handleShipSuccess}
      />
      <MotoboyDialog
        open={openDialog === 'motoboy'}
        onOpenChange={(o) => !o && setOpenDialog(null)}
        order={orderForDialog}
        customer={customerForDialog}
        shippingAddress={shippingAddress}
        onSuccess={handleShipSuccess}
      />
    </div>
  );
}
