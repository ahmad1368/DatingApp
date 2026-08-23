import 'dart:convert';

import 'package:http/http.dart' as http;

class ScreenSecurityApiException implements Exception {
  ScreenSecurityApiException(this.message);

  final String message;

  @override
  String toString() => message;
}

class ScreenSecurityStatus {
  ScreenSecurityStatus({required this.frozen, this.frozenUntil, required this.violationCount});

  final bool frozen;
  final DateTime? frozenUntil;
  final int violationCount;
}

class ScreenSecurityViolationResult extends ScreenSecurityStatus {
  ScreenSecurityViolationResult({
    required this.warning,
    required super.frozen,
    super.frozenUntil,
    required super.violationCount,
  });

  final String warning;
}

/// Talks to the backend's screen-capture protection endpoints: reporting a
/// detected screenshot/recording attempt and checking whether the current
/// user's account is (still) temporarily frozen for repeated violations.
class ScreenSecurityApi {
  ScreenSecurityApi({required this.accessToken, http.Client? client, String? baseUrl})
      : _client = client ?? http.Client(),
        _baseUrl = baseUrl ?? 'http://10.0.2.2:3000';

  final String accessToken;
  final http.Client _client;
  final String _baseUrl;

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $accessToken',
      };

  Future<ScreenSecurityStatus> fetchStatus() async {
    final response = await _client.get(
      Uri.parse('$_baseUrl/screen-security/status'),
      headers: _headers,
    );

    if (response.statusCode != 200) {
      throw ScreenSecurityApiException(_errorMessage(_decode(response), response.statusCode));
    }

    final json = _decode(response);
    return ScreenSecurityStatus(
      frozen: json['frozen'] as bool,
      frozenUntil: json['frozenUntil'] != null ? DateTime.parse(json['frozenUntil'] as String) : null,
      violationCount: json['violationCount'] as int,
    );
  }

  Future<ScreenSecurityViolationResult> reportViolation(String context) async {
    final response = await _client.post(
      Uri.parse('$_baseUrl/screen-security/violations'),
      headers: _headers,
      body: jsonEncode({'context': context}),
    );

    if (response.statusCode != 201) {
      throw ScreenSecurityApiException(_errorMessage(_decode(response), response.statusCode));
    }

    final json = _decode(response);
    return ScreenSecurityViolationResult(
      warning: json['warning'] as String,
      frozen: json['frozen'] as bool,
      frozenUntil: json['frozenUntil'] != null ? DateTime.parse(json['frozenUntil'] as String) : null,
      violationCount: json['violationCount'] as int,
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
