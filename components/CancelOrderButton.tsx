'use client';

/**
 * Cancelling an order, with its cost shown first.
 *
 * A cancellation is priced by how far the order has got: a full refund before
 * the kitchen starts, the food and a dispatched driver's trip paid for after,
 * no refund once the driver has collected it. So this never cancels on one
 * click. It asks the API what cancelling would cost right now, says so in
 * plain terms, and only cancels once the customer has seen that and agreed.
 *
 * The figures are the server's. The stage they were worked out for goes back
 * with the cancellation, and the API refuses if the order has moved on in the
 * meantime — so the price a customer confirms is the price they get.
 *
 * The same flow as the customer app's CancelOrderButton, with the same words:
 * someone who cancels on the website and someone who cancels on their phone
 * should be told the same thing.
 */

import { useState } from 'react';
import { Loader2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { ApiError } from '../services/apiClient';
import {
  cancelOrder,
  previewCancellation,
  type CancellationPreview,
} from '../services/ordersApi';

const rands = (amount: number) => `R${amount.toFixed(2)}`;

/**
 * What cancelling would mean, one sentence per line, for the confirmation.
 *
 * Exported so the wording can be checked against every tier.
 */
export function describeCancellation(
  preview: CancellationPreview,
  order: { paymentMethod: string; paymentStatus: string },
): string[] {
  // Nothing was taken up front, so there is no money to talk about.
  if (order.paymentMethod === 'cash' || order.paymentStatus !== 'paid') {
    return ['You haven’t been charged for this order, so there’s nothing to refund.'];
  }

  switch (preview.stage) {
    case 'before_prep':
      return [
        `The kitchen hasn’t started yet, so you’ll get your full ${rands(
          preview.customerRefund,
        )} back in your LokshinEats wallet.`,
      ];

    case 'in_kitchen':
      return [
        preview.customerRefund > 0
          ? `You’ll get ${rands(preview.customerRefund)} back in your LokshinEats wallet.`
          : 'You won’t get a refund.',
        ...(preview.vendorPay > 0
          ? [
              `${rands(
                preview.vendorPay,
              )} pays the kitchen for food that is already being made.`,
            ]
          : []),
        ...(preview.driverPay > 0
          ? [
              `${rands(
                preview.driverPay,
              )} pays your driver, who is already on the way to collect it.`,
            ]
          : []),
      ];

    case 'on_the_way':
      return [
        'There’s no refund: your driver has already collected your food, so the ' +
          'kitchen and the driver are paid in full.',
      ];

    default:
      return ['This order will be cancelled.'];
  }
}

type Props = {
  orderId: string;
  paymentMethod: string;
  paymentStatus: string;
  /**
   * Called after a cancellation, and when the order turned out to have moved
   * on. Optional: a screen with a live Firestore listener already shows the
   * new state by itself.
   */
  onOrderChanged?: () => void;
};

export default function CancelOrderButton({
  orderId,
  paymentMethod,
  paymentStatus,
  onOrderChanged,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<CancellationPreview | null>(null);

  async function start() {
    setBusy(true);
    try {
      const result = await previewCancellation(orderId);

      if (!result.allowed || !result.stage) {
        toast.error(
          result.reason ?? 'Contact LokshinEats support to cancel this order.',
        );
        return;
      }

      setPreview(result);
    } catch (error) {
      toast.error(
        error instanceof ApiError ? error.message : 'Could not reach LokshinEats.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!preview?.stage) return;

    setBusy(true);
    try {
      await cancelOrder(orderId, preview.stage);
      setPreview(null);
      toast.success('Order cancelled');
      onOrderChanged?.();
    } catch (error) {
      // Most often the order moved on while the confirmation was open. The
      // API's message says so; refresh so the screen shows where it is now.
      toast.error(
        error instanceof ApiError ? error.message : 'Could not cancel the order.',
      );
      if (error instanceof ApiError && error.code === 'conflict') {
        setPreview(null);
        onOrderChanged?.();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={start}
        disabled={busy}
        className="w-full flex items-center justify-center gap-2 border border-red-300 text-red-600 rounded-xl py-3 font-semibold hover:bg-red-50 disabled:opacity-60"
      >
        {busy && !preview ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <X className="w-4 h-4" />
        )}
        Cancel order
      </button>

      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cancel-order-title"
        >
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <h2 id="cancel-order-title" className="text-xl font-bold mb-3">
              Cancel this order?
            </h2>

            <div className="space-y-2 mb-6">
              {describeCancellation(preview, { paymentMethod, paymentStatus }).map(
                (line) => (
                  <p key={line} className="text-sm text-gray-700">
                    {line}
                  </p>
                ),
              )}
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setPreview(null)}
                disabled={busy}
                className="flex-1 border border-gray-300 rounded-xl py-3 font-semibold hover:bg-gray-50 disabled:opacity-60"
              >
                Keep order
              </button>
              <button
                type="button"
                onClick={confirm}
                disabled={busy}
                className="flex-1 flex items-center justify-center gap-2 bg-red-600 text-white rounded-xl py-3 font-semibold hover:bg-red-700 disabled:opacity-60"
              >
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                Cancel order
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
