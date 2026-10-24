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
  });

  factory DriverVerification.fromJson(Map<String, dynamic> json) {
    return DriverVerification(
      vehicleType: VehicleType.fromWire(json['vehicleType']),
      licenceNumber: _text(json['licenceNumber']),
      vehicleRegistration: _text(json['vehicleRegistration']),
      idNumber: _text(json['idNumber']) ?? '',
      status: VerificationStatus.fromWire(json['status']),
      decisionReason: _text(json['decisionReason']),
    );
  }

  final VehicleType vehicleType;
  final String? licenceNumber;
  final String? vehicleRegistration;
  final String idNumber;
  final VerificationStatus status;

  /// Why it was turned down, in the reviewer's words.
  final String? decisionReason;

  bool get mayDeliver => status == VerificationStatus.approved;
}

String? _text(Object? value) {
  if (value is! String) return null;
  final trimmed = value.trim();
  return trimmed.isEmpty ? null : trimmed;
}
