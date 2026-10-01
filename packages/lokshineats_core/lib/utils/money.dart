/// Money formatting.
///
/// The API sends rands as numbers with at most two decimals — it does the
/// arithmetic in integer cents server-side precisely so the client never has
/// to. This only formats.
library;

import 'package:intl/intl.dart';

final NumberFormat _rand = NumberFormat.currency(
  locale: 'en_ZA',
  symbol: 'R',
  decimalDigits: 2,
);

/// `R45.50`. Used wherever an exact amount is shown.
String formatRands(num amount) => _rand.format(amount);

/// `R45.50`, or `R46` when the amount is whole.
///
/// Menu prices read better without trailing zeros, but a total a customer is
/// about to pay always shows both decimals — use [formatRands] there.
String formatPrice(num amount) {
  if (amount == amount.roundToDouble()) {
    return 'R${amount.toInt()}';
  }
  return formatRands(amount);
}

/// Distance as drivers and customers talk about it: `4.2 km`, or `750 m`.
String formatDistanceKm(double? km) {
  if (km == null) return '';
  if (km < 1) return '${(km * 1000).round()} m';
  return '${km.toStringAsFixed(1)} km';
}
