/// What a kitchen has earned, and what it owes from cash orders.
///
/// The screen itself is shared with the driver app (see `EarningsView`); this
/// is a kitchen's way of putting it.
library;

import 'package:flutter/material.dart';

import 'package:lokshineats_core/utils/money.dart';
import 'package:lokshineats_core/wallet/earnings_view.dart';
import 'package:lokshineats_core/wallet/wallet.dart';

final vendorEarningsWording = EarningsWording(
  oweExplanation:
      'Commission on cash orders. The driver paid you the full food price, so '
      'LokshinEats’ share of it is still with you. Your card orders pay '
      'it down.',
  jobs: _orders,
  entryLabel: _label,
  emptyTitle: 'No earnings yet',
  emptySubtitle: 'What you earn on each order shows up here.',
  pendingNote: (pending) =>
      '${formatRands(pending)} of this is on orders still on their way. It is '
      'yours once they are delivered.',
);

String _orders(int count) => count == 1 ? '1 order' : '$count orders';

String _label(LedgerEntry entry) => switch (entry.type) {
  LedgerEntryType.orderEarning => 'Order earnings',
  LedgerEntryType.cashHandover => 'Paid to you in cash by the driver',
  LedgerEntryType.refund when entry.amount < 0 =>
    'Taken back: the order was cancelled',
  LedgerEntryType.goodwill => 'Paid by LokshinEats',
  LedgerEntryType.withdrawal => 'Paid out to you',
  _ => entry.type.label,
};

class EarningsPage extends StatelessWidget {
  const EarningsPage({super.key});

  @override
  Widget build(BuildContext context) =>
      EarningsView(wording: vendorEarningsWording);
}
