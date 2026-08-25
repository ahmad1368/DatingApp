import 'dart:convert';

import 'package:http/http.dart' as http;

class WorkVerificationApiException implements Exception {
  WorkVerificationApiException(this.message);

  final String message;

  @override
  String toString() => message;
}

class CredentialStatus {
  CredentialStatus({
    this.jobTitle,
    this.company,
    this.school,
    required this.isWorkVerified,
    required this.isEducationVerified,
  });

  final String? jobTitle;
  final String? company;
  final String? school;
  final bool isWorkVerified;
  final bool isEducationVerified;
}

class RequestVerificationResult {
  RequestVerificationResult({required this.expiresInSeconds, required this.resendCooldownSeconds});

  final int expiresInSeconds;
  final int resendCooldownSeconds;
}

/// Talks to the backend's dynamic work/education verification endpoints:
/// claim a job title/company (or school), then confirm ownership of a code
/// sent to that credential's email - the same request/confirm shape as the
/// phone OTP login flow, just for a claimed credential instead of a login.
class WorkVerificationApi {
  WorkVerificationApi({required this.accessToken, http.Client? client, String? baseUrl})
      : _client = client ?? http.Client(),
        _baseUrl = baseUrl ?? 'http://10.0.2.2:3000';

  final String accessToken;
  final http.Client _client;
  final String _baseUrl;

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $accessToken',
      };

  Future<CredentialStatus> fetchStatus() async {
    final response = await _client.get(
      Uri.parse('$_baseUrl/work-verification/status'),
      headers: _headers,
    );

    final body = _decode(response);
    if (response.statusCode != 200) {
      throw WorkVerificationApiException(_errorMessage(body, response.statusCode));
    }

    return _toStatus(body);
  }

  /// [type] is 'WORK' or 'EDUCATION'. Pass [jobTitle]/[company] for WORK, or
  /// [school] for EDUCATION.
  Future<RequestVerificationResult> requestVerification({
    required String type,
    required String email,
    String? jobTitle,
    String? company,
    String? school,
  }) async {
    final response = await _client.post(
      Uri.parse('$_baseUrl/work-verification/request'),
      headers: _headers,
      body: jsonEncode({
        'type': type,
        'email': email,
        'jobTitle': ?jobTitle,
        'company': ?company,
        'school': ?school,
      }),
    );

    final body = _decode(response);
    if (response.statusCode != 200) {
      throw WorkVerificationApiException(_errorMessage(body, response.statusCode));
    }

    return RequestVerificationResult(
      expiresInSeconds: body['expiresInSeconds'] as int,
      resendCooldownSeconds: body['resendCooldownSeconds'] as int,
    );
  }

  Future<CredentialStatus> confirmVerification(String code) async {
    final response = await _client.post(
      Uri.parse('$_baseUrl/work-verification/confirm'),
      headers: _headers,
      body: jsonEncode({'code': code}),
    );

    final body = _decode(response);
    if (response.statusCode != 200) {
      throw WorkVerificationApiException(_errorMessage(body, response.statusCode));
    }

    return _toStatus(body);
  }

  CredentialStatus _toStatus(Map<String, dynamic> json) {
    return CredentialStatus(
      jobTitle: json['jobTitle'] as String?,
      company: json['company'] as String?,
      school: json['school'] as String?,
      isWorkVerified: json['isWorkVerified'] as bool,
      isEducationVerified: json['isEducationVerified'] as bool,
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
