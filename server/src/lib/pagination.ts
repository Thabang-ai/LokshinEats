/**
 * Cursor pagination helpers.
 *
 * Firestore has no cheap offset, and an offset scan gets slower the deeper a
 * customer's order history goes. Cursors stay constant-cost at any depth,
 * which is what makes list endpoints viable at scale.
 */

import { z } from 'zod';

/** Hard ceiling regardless of what a client asks for. */
export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 20;

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  /** Opaque to clients: the document id to resume after. */
  cursor: z.string().min(1).max(200).optional(),
});

export type Pagination = z.infer<typeof paginationSchema>;

export type Page<T> = {
  items: T[];
  /** Pass back as `cursor` to fetch the next page; null when exhausted. */
  nextCursor: string | null;
};

/**
 * Build a page from one extra row.
 *
 * Queries fetch `limit + 1` documents; the surplus row proves another page
 * exists without a second count query.
 */
export function buildPage<T extends { id: string }>(
  rows: T[],
  limit: number,
): Page<T> {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];
  return {
    items,
    nextCursor: hasMore && last ? last.id : null,
  };
}
