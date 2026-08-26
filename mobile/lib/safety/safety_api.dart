import 'dart:convert';

import 'package:http/http.dart' as http;

class SafetyApiException implements Exception {
  SafetyApiException(this.message);

  final String message;

  @override
  String toString() => message;
}

class SafetyResource {
  SafetyResource({
    required this.id,
    required this.title,
    required this.summary,
    required this.category,
  });

  final String id;
  final String title;
  final String summary;
  final String category;
}

class CheckIn {
  CheckIn({
    required this.id,
    this.matchId,
    this.location,
    required this.scheduledAt,
    this.emergencyContactName,
    this.emergencyContactPhone,
    this.notes,
    this.confirmedAt,
    required this.status,
    this.alertSent = false,
  });

  final String id;
  final String? matchId;
  final String? location;
  final DateTime scheduledAt;
  final String? emergencyContactName;
  final String? emergencyContactPhone;
  final String? notes;
  final DateTime? confirmedAt;
  final String status;
  final bool alertSent;

  bool get isOverdue => status == 'OVERDUE';
  bool get isConfirmed => status == 'CONFIRMED';
}

class EmergencyContact {
  EmergencyContact({required this.id, required this.name, required this.phone});

  final String id;
  final String name;
  final String phone;
}

class SosAlertResult {
  SosAlertResult({required this.id, required this.notifiedContactIds, required this.createdAt});

  final String id;
  final List<String> notifiedContactIds;
  final DateTime createdAt;
}

/// Talks to the backend's safety center: educational resources, date
/// check-ins, emergency contacts, SOS alerts, and user reporting. Requires
/// a signed-in user's access token.
class SafetyApi {
  SafetyApi({required this.accessToken, http.Client? client, String? baseUrl})
      : _client = client ?? http.Client(),
        _baseUrl = baseUrl ?? 'http://10.0.2.2:3000';

  final String accessToken;
  final http.Client _client;
  final String _baseUrl;

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $accessToken',
      };

  Future<List<SafetyResource>> fetchResources() async {
    final response = await _client.get(
      Uri.parse('$_baseUrl/safety/resources'),
      headers: _headers,
    );

    if (response.statusCode != 200) {
      throw SafetyApiException(_errorMessage(_decode(response), response.statusCode));
    }

    final list = jsonDecode(response.body) as List;
    return list
        .cast<Map<String, dynamic>>()
        .map(
          (json) => SafetyResource(
            id: json['id'] as String,
            title: json['title'] as String,
            summary: json['summary'] as String,
            category: json['category'] as String,
          ),
        )
        .toList();
  }

  Future<void> reportUser({
    required String reportedUserId,
    required String reason,
    String? details,
  }) async {
    final response = await _client.post(
      Uri.parse('$_baseUrl/safety/reports'),
      headers: _headers,
      body: jsonEncode({
        'reportedUserId': reportedUserId,
        'reason': reason,
        if (details != null) 'details': details,
      }),
    );

    if (response.statusCode != 201) {
      throw SafetyApiException(_errorMessage(_decode(response), response.statusCode));
    }
  }

  Future<CheckIn> createCheckIn({
    required DateTime scheduledAt,
    String? matchId,
    String? location,
    String? emergencyContactName,
    String? emergencyContactPhone,
    String? notes,
  }) async {
    final response = await _client.post(
      Uri.parse('$_baseUrl/safety/check-ins'),
      headers: _headers,
      body: jsonEncode({
        'scheduledAt': scheduledAt.toUtc().toIso8601String(),
        if (matchId != null) 'matchId': matchId,
        if (location != null) 'location': location,
        if (emergencyContactName != null) 'emergencyContactName': emergencyContactName,
        if (emergencyContactPhone != null) 'emergencyContactPhone': emergencyContactPhone,
        if (notes != null) 'notes': notes,
      }),
    );

    final body = _decode(response);
    if (response.statusCode != 201) {
      throw SafetyApiException(_errorMessage(body, response.statusCode));
    }

    return _toCheckIn(body);
  }

  Future<List<CheckIn>> fetchCheckIns() async {
    final response = await _client.get(
      Uri.parse('$_baseUrl/safety/check-ins'),
      headers: _headers,
    );

    if (response.statusCode != 200) {
      throw SafetyApiException(_errorMessage(_decode(response), response.statusCode));
    }

    final list = jsonDecode(response.body) as List;
    return list.cast<Map<String, dynamic>>().map(_toCheckIn).toList();
  }

  Future<CheckIn> confirmCheckIn(String checkInId) async {
    final response = await _client.put(
      Uri.parse('$_baseUrl/safety/check-ins/$checkInId/confirm'),
      headers: _headers,
    );

    final body = _decode(response);
    if (response.statusCode != 200) {
      throw SafetyApiException(_errorMessage(body, response.statusCode));
    }

    return _toCheckIn(body);
  }

  Future<List<EmergencyContact>> fetchEmergencyContacts() async {
    final response = await _client.get(
      Uri.parse('$_baseUrl/safety/emergency-contacts'),
      headers: _headers,
    );

    if (response.statusCode != 200) {
      throw SafetyApiException(_errorMessage(_decode(response), response.statusCode));
    }

    final list = jsonDecode(response.body) as List;
    return list.cast<Map<String, dynamic>>().map(_toEmergencyContact).toList();
  }

  Future<EmergencyContact> addEmergencyContact({required String name, required String phone}) async {
    final response = await _client.post(
      Uri.parse('$_baseUrl/safety/emergency-contacts'),
      headers: _headers,
      body: jsonEncode({'name': name, 'phone': phone}),
    );

    final body = _decode(response);
    if (response.statusCode != 201) {
      throw SafetyApiException(_errorMessage(body, response.statusCode));
    }

    return _toEmergencyContact(body);
  }

  Future<void> deleteEmergencyContact(String contactId) async {
    final response = await _client.delete(
      Uri.parse('$_baseUrl/safety/emergency-contacts/$contactId'),
      headers: _headers,
    );

    if (response.statusCode != 200) {
      throw SafetyApiException(_errorMessage(_decode(response), response.statusCode));
    }
  }

  /// Quick-trigger SOS: immediately texts the current coordinates to the
  /// given emergency contacts (or all of them, if [contactIds] is omitted).
  Future<SosAlertResult> triggerSos({
    required double latitude,
    required double longitude,
    String? matchId,
    List<String>? contactIds,
  }) async {
    final response = await _client.post(
      Uri.parse('$_baseUrl/safety/sos'),
      headers: _headers,
      body: jsonEncode({
        'latitude': latitude,
        'longitude': longitude,
        'matchId': ?matchId,
        'contactIds': ?contactIds,
      }),
    );

    final body = _decode(response);
    if (response.statusCode != 201) {
      throw SafetyApiException(_errorMessage(body, response.statusCode));
    }

    return SosAlertResult(
      id: body['id'] as String,
      notifiedContactIds: (body['notifiedContactIds'] as List).cast<String>(),
      createdAt: DateTime.parse(body['createdAt'] as String),
    );
  }

  EmergencyContact _toEmergencyContact(Map<String, dynamic> json) {
    return EmergencyContact(
      id: json['id'] as String,
      name: json['name'] as String,
      phone: json['phone'] as String,
    );
  }

  CheckIn _toCheckIn(Map<String, dynamic> json) {
    return CheckIn(
      id: json['id'] as String,
      matchId: json['matchId'] as String?,
      location: json['location'] as String?,
      scheduledAt: DateTime.parse(json['scheduledAt'] as String),
      emergencyContactName: json['emergencyContactName'] as String?,
      emergencyContactPhone: json['emergencyContactPhone'] as String?,
      notes: json['notes'] as String?,
      confirmedAt: json['confirmedAt'] != null ? DateTime.parse(json['confirmedAt'] as String) : null,
      status: json['status'] as String,
      alertSent: json['alertSent'] as bool? ?? false,
    );
  }

  Map<String, dynamic> _decode(http.Response response) {
    if (response.body.isEmpty) {
      return const {};
    }
    return jsonDecode(response.body) as Map<String, dynamic>;
  }

  String _errorMessage(Map<String, dynamic> body, int statusCode) {
    final message = body['message'];
    if (message is String) {
      return message;
    }
    if (message is List && message.isNotEmpty) {
      return message.first.toString();
    }
    return 'Request failed with status $statusCode';
  }
}
