// Order items, read from a raw Firestore order document.
//
// Orders exist in two shapes, and every page that lists items has to handle
// both:
//
//   - Placed through the API (POST /api/v1/orders): each item is flat —
//     { productId, name, price, quantity, specialInstructions, lineTotal } —
//     with the price read from the product record at the moment of ordering.
//   - Written by the old browser checkout: each item nests the whole product
//     — { product: { id, name, price, ... }, quantity }.
//
// The pages used to read only the nested shape, so every order placed through
// the API showed up as "1x Item R0.00". This mirrors the server's own
// `toOrderItems` (server/src/modules/orders/order.model.ts): the flat field
// wins, the nested one is the fallback, so both kinds of order read the same.
//
// Kept in one place on purpose. The mapping had been copied into seven pages,
// which is how all seven ended up with the same bug.

export type OrderItemView = {
  productId: string;
  name: string;
  /** Unit price the order was placed at, in rands. */
  price: number;
  quantity: number;
  specialInstructions: string | null;
};

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Normalise an order document's `items` field.
 *
 * Anything that is not an array reads as no items, and a malformed entry
 * falls back field by field rather than throwing — one bad document must not
 * blank out a vendor's whole order list.
 */
export function readOrderItems(value: unknown): OrderItemView[] {
  if (!Array.isArray(value)) return [];

  return value.map((raw) => {
    const item = (raw ?? {}) as Record<string, unknown>;
    const product = (item.product ?? {}) as Record<string, unknown>;

    return {
      productId: readString(item.productId) ?? readString(product.id) ?? '',
      name: readString(item.name) ?? readString(product.name) ?? 'Item',
      price: readNumber(item.price, readNumber(product.price, 0)),
      quantity: readNumber(item.quantity, 1),
      specialInstructions: readString(item.specialInstructions),
    };
  });
}
