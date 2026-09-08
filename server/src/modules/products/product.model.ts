/**
 * Product domain model.
 *
 * Field names match what the vendor dashboard already writes (see
 * app/vendor/products/new/page.tsx).
 *
 * `storeId` is never client-writable. It is derived from the calling vendor's
 * own store, which is what stops one vendor adding items to another's menu —
 * and, once orders are priced server-side, stops a product being moved
 * between stores to change what an order costs.
 */

import { z } from 'zod';
import type { DocumentSnapshot } from 'firebase-admin/firestore';
import { toBoolean, toIso, toNumber, toStringOr } from '../../lib/serialize';

export type Product = {
  id: string;
  storeId: string;
  name: string;
  description: string;
  price: number;
  image: string | null;
  category: string;
  available: boolean;
  isVegetarian: boolean;
  isSpicy: boolean;
  preparationTime: number;
  createdAt: string | null;
  updatedAt: string | null;
};

/**
 * A menu price. Bounded and cent-aligned: sub-cent prices cannot be charged,
 * and an unbounded price is a data-entry accident waiting to reach a
 * customer's card.
 */
const priceSchema = z
  .number()
  .min(0.01, 'Price must be at least one cent.')
  .max(10_000, 'Price is unrealistically high.')
  .multipleOf(0.01, 'Price may not be finer than one cent.');

const baseProductFields = {
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).default(''),
  price: priceSchema,
  category: z.string().trim().min(1).max(40),
  image: z.string().trim().url().max(500).optional(),
  available: z.boolean().default(true),
  isVegetarian: z.boolean().default(false),
  isSpicy: z.boolean().default(false),
  preparationTime: z
    .number()
    .int()
    .min(1, 'Preparation time must be at least a minute.')
    .max(240, 'Preparation time is unrealistically long.')
    .default(20),
};

export const createProductSchema = z.object(baseProductFields).strict();
export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductSchema = z
  .object({
    ...baseProductFields,
    name: baseProductFields.name.optional(),
    description: z.string().trim().max(500).optional(),
    price: priceSchema.optional(),
    category: baseProductFields.category.optional(),
    available: z.boolean().optional(),
    isVegetarian: z.boolean().optional(),
    isSpicy: z.boolean().optional(),
    preparationTime: baseProductFields.preparationTime.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to update.',
  });

export type UpdateProductInput = z.infer<typeof updateProductSchema>;

export const productIdParamSchema = z.object({
  id: z.string().trim().min(1).max(128),
});

export const listProductsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().min(1).max(200).optional(),
  storeId: z.string().trim().min(1).max(128).optional(),
  category: z.string().trim().min(1).max(40).optional(),
  /** Customers browsing a menu only want items that can be ordered. */
  availableOnly: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
});

export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;

/** Firestore document -> API representation. */
export function toProduct(snapshot: DocumentSnapshot): Product {
  const data = snapshot.data() ?? {};

  return {
    id: snapshot.id,
    storeId: toStringOr(data.storeId),
    name: toStringOr(data.name),
    description: toStringOr(data.description),
    price: toNumber(data.price),
    image:
      typeof data.image === 'string' && data.image.length > 0
        ? data.image
        : null,
    category: toStringOr(data.category),
    // Absent means orderable: documents written before the flag existed
    // should not silently disappear from menus.
    available: toBoolean(data.available, true),
    isVegetarian: toBoolean(data.isVegetarian),
    isSpicy: toBoolean(data.isSpicy),
    preparationTime: toNumber(data.preparationTime, 20),
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
  };
}
