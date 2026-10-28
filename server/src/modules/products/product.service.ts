/**
 * Product business rules.
 *
 * Every mutation goes through `assertOwnership`, which compares the product's
 * `storeId` against the store the caller actually owns. Admins are allowed
 * through explicitly rather than by being added to a role list, so the check
 * cannot be widened by accident.
 */

import { ApiError } from '../../lib/ApiError';
import { moduleLogger } from '../../config/logger';
import type { Page } from '../../lib/pagination';
import type { AuthContext } from '../../middleware/auth';
import * as storeService from '../stores/store.service';
import {
  assertUploadable,
  productImagePath,
  type ImageContentType,
} from '../images/image.model';
import { imageStore, type StoredImage } from '../images/image.store';
import type {
  CreateProductInput,
  ListProductsQuery,
  Product,
  UpdateProductInput,
} from './product.model';
import * as repository from './product.repository';

const log = moduleLogger('products');

export async function listProducts(
  query: ListProductsQuery,
): Promise<Page<Product>> {
  return repository.list(query);
}

export async function getProduct(id: string): Promise<Product> {
  const product = await repository.findById(id);
  if (!product) throw ApiError.notFound('No such product.');
  return product;
}

export async function createProduct(
  caller: AuthContext,
  input: CreateProductInput,
): Promise<Product> {
  const store = await storeService.requireOwnedStore(caller);
  const product = await repository.create(store.id, input);

  log.info(
    { uid: caller.uid, storeId: store.id, productId: product.id },
    'Product created.',
  );
  return product;
}

export async function updateProduct(
  caller: AuthContext,
  productId: string,
  input: UpdateProductInput,
): Promise<Product> {
  await assertOwnership(caller, productId);
  return repository.update(productId, input);
}

export async function deleteProduct(
  caller: AuthContext,
  productId: string,
): Promise<void> {
  await assertOwnership(caller, productId);
  await repository.remove(productId);
  log.info({ uid: caller.uid, productId }, 'Product deleted.');
}

/**
 * Put a photograph on a menu item.
 *
 * The photograph is stored on its own and the product is pointed at it, so a
 * menu listing carries a short path rather than the bytes. The path changes
 * whenever the photograph does, which is what makes it safe to cache the
 * image response for a year.
 */
export async function setProductImage(
  caller: AuthContext,
  productId: string,
  bytes: Buffer,
  contentType: ImageContentType,
): Promise<Product> {
  await assertOwnership(caller, productId);

  const version = await imageStore().put(productId, {
    bytes: assertUploadable(bytes),
    contentType,
  });

  log.info(
    { uid: caller.uid, productId, bytes: bytes.length },
    'Product photo uploaded.',
  );

  return repository.update(productId, {
    image: productImagePath(productId, version),
  });
}

/** The photograph itself, for anyone: menus are public. */
export async function getProductImage(
  productId: string,
): Promise<StoredImage> {
  const stored = await imageStore().get(productId);
  if (!stored) throw ApiError.notFound('No photo for that item.');
  return stored;
}

/** The calling vendor's full menu, including unavailable items. */
export async function listOwnProducts(
  caller: AuthContext,
  query: Omit<ListProductsQuery, 'storeId'>,
): Promise<Page<Product>> {
  const store = await storeService.requireOwnedStore(caller);
  return repository.list({ ...query, storeId: store.id });
}

/**
 * Confirm the caller may modify this product.
 *
 * Reports a missing product and someone else's product identically, so an id
 * cannot be probed to learn whether it exists.
 */
async function assertOwnership(
  caller: AuthContext,
  productId: string,
): Promise<Product> {
  const product = await repository.findById(productId);
  if (!product) throw ApiError.notFound('No such product.');

  if (caller.role === 'admin') return product;

  const store = await storeService.requireOwnedStore(caller);
  if (product.storeId !== store.id) {
    log.warn(
      { uid: caller.uid, productId, storeId: product.storeId },
      'Rejected cross-store product write.',
    );
    throw ApiError.notFound('No such product.');
  }

  return product;
}
