/**
 * Order domain model.
 *
 * REPLACE LATER: map this to a Firestore document schema.
 * Collection: "orders" | document id: order.id
 */

export type OrderStatus = "Created" | "Pending Payment" | "Paid";

export interface OrderProduct {
  name: string;
  quantity: number;
  /** Price per unit in cents (e.g. 4990 = R$49,90) */
  price: number;
}

export interface Order {
  id: string;
  products: OrderProduct[];
  /** Total in cents */
  totalAmount: number;
  customer: string;
  status: OrderStatus;
  createdAt: Date;
}
