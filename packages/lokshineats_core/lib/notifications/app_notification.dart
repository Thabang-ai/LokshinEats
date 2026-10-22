/// A notification about one of the customer's orders.
///
/// The words are the server's: it decides what to say about each moment, so
/// the push on a lock screen and this inbox always say the same thing.
library;

enum NotificationKind {
  orderAccepted,
  orderOnTheWay,
  orderDelivered,
  orderCancelled,
  other;

  static NotificationKind fromWire(Object? value) => switch (value) {
    'order_accepted' => NotificationKind.orderAccepted,
    'order_on_the_way' => NotificationKind.orderOnTheWay,
    'order_delivered' => NotificationKind.orderDelivered,
    'order_cancelled' => NotificationKind.orderCancelled,
    _ => NotificationKind.other,
  };
}

class AppNotification {
  const AppNotification({
    required this.id,
    required this.kind,
    required this.title,
    required this.body,
    this.orderId,
    this.createdAt,
    this.readAt,
  });

  factory AppNotification.fromJson(Map<String, dynamic> json) {
    return AppNotification(
      id: json['id'] as String? ?? '',
      kind: NotificationKind.fromWire(json['kind']),
      title: json['title'] as String? ?? '',
      body: json['body'] as String? ?? '',
      orderId: switch (json['orderId']) {
        final String s when s.isNotEmpty => s,
        _ => null,
      },
      createdAt: _date(json['createdAt']),
      readAt: _date(json['readAt']),
    );
  }

  final String id;
  final NotificationKind kind;
  final String title;
  final String body;

  /// The order it is about, which tapping it opens.
  final String? orderId;
  final DateTime? createdAt;
  final DateTime? readAt;

  bool get isRead => readAt != null;

  AppNotification markedRead() => AppNotification(
    id: id,
    kind: kind,
    title: title,
    body: body,
    orderId: orderId,
    createdAt: createdAt,
    readAt: readAt ?? DateTime.now(),
  );
}

DateTime? _date(Object? value) =>
    value is String ? DateTime.tryParse(value)?.toLocal() : null;
