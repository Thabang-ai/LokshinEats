/// What this driver told us, and whether anyone has checked it.
///
/// Mirrors the API's driver profile. The app never decides any of this: it
/// shows the state the API reports and lets the driver change what they said.
library;

enum VehicleType {
  bicycle('bicycle', 'Bicycle'),
  motorbike('motorbike', 'Motorbike'),
  car('car', 'Car');

  const VehicleType(this.wire, this.label);

  final String wire;
  final String label;

  /// Whether the law expects a licence and a registration for this.
  bool get needsPapers => this != VehicleType.bicycle;

  static VehicleType fromWire(Object? value) => VehicleType.values.firstWhere(
    (type) => type.wire == value,
    orElse: () => VehicleType.bicycle,
  );
}

enum VerificationStatus {
  pending,
  approved,
  rejected;

  static VerificationStatus fromWire(Object? value) =>
      VerificationStatus.values.firstWhere(
        (status) => status.name == value,
        orElse: () => VerificationStatus.pending,
      );
}

class DriverVerification {
  const DriverVerification({
    required this.vehicleType,
    required this.licenceNumber,
    required this.vehicleRegistration,
    required this.idNumber,
    required this.status,
    required this.decisionReason,
    this.rating = 0,
    this.ratingCount = 0,
  });

  factory DriverVerification.fromJson(Map<String, dynamic> json) {
    return DriverVerification(
      vehicleType: VehicleType.fromWire(json['vehicleType']),
      licenceNumber: _text(json['licenceNumber']),
      vehicleRegistration: _text(json['vehicleRegistration']),
      idNumber: _text(json['idNumber']) ?? '',
      status: VerificationStatus.fromWire(json['status']),
      decisionReason: _text(json['decisionReason']),
      rating: switch (json['rating']) {
        final num value => value.toDouble(),
        _ => 0.0,
      },
      ratingCount: switch (json['ratingCount']) {
        final num value => value.toInt(),
        _ => 0,
      },
    );
  }

  final VehicleType vehicleType;
  final String? licenceNumber;
  final String? vehicleRegistration;
  final String idNumber;
  final VerificationStatus status;

  /// Why it was turned down, in the reviewer's words.
  final String? decisionReason;

  /// What customers made of them, out of five.
  ///
  /// Zero is "nobody has rated you yet", which is not nought out of five -
  /// every screen showing it has to say which it means.
  final double rating;
  final int ratingCount;

  bool get hasRating => ratingCount > 0;

  bool get mayDeliver => status == VerificationStatus.approved;
}

String? _text(Object? value) {
  if (value is! String) return null;
  final trimmed = value.trim();
  return trimmed.isEmpty ? null : trimmed;
}
