/// What a driver has earned, and what they owe from cash deliveries.
///
/// The screen itself is shared with the vendor app (see `EarningsView`);
/// this is a driver's way of putting it.
library;

import 'package:flutter/material.dart';

import 'package:lokshineats_core/wallet/earnings_view.dart';
import 'package:lokshineats_core/wallet/wallet.dart';

const driverEarningsWording = EarningsWording(
  oweExplanation:
      'Cash you collected at the door is mostly the kitchen’s and '
      'LokshinEats’. It clears as kitchens confirm you handed their share '
      'over, and your card deliveries pay the rest down.',
  jobs: _deliveries,
  entryLabel: _label,
  emptyTitle: 'No earnings yet',
  emptySubtitle:
      'Your pay for each delivery shows up here once it is delivered.',
);

String _deliveries(int count) =>
    count == 1 ? '1 delivery' : '$count deliveries';

String _label(LedgerEntry entry) => switch (entry.type) {
  LedgerEntryType.orderEarning => 'Delivery pay',
  LedgerEntryType.cashCollected => 'Cash collected from the customer',
  LedgerEntryType.cashHandover => 'Cash handed to the kitchen',
  LedgerEntryType.goodwill => 'Paid by LokshinEats',
  LedgerEntryType.withdrawal => 'Paid out to you',
  _ => entry.type.label,
};

class EarningsPage extends StatelessWidget {
  const EarningsPage({super.key});

  @override
  Widget build(BuildContext context) =>
      const EarningsView(wording: driverEarningsWording);
}
