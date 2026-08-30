import 'dart:convert';

import 'package:http/http.dart' as http;

class VerificationApiException implements Exception {
  VerificationApiException(this.message);

  final String message;

  @override
  String toString() => message;
}

class VerificationChallenge {
  VerificationChallenge({
    required this.challengeId,
    required this.gesture,
    required this.expiresInSeconds,
  });

  final String challengeId;
  final String gesture;
  final int expiresInSeconds;
}

class VerificationResult {
  VerificationResult({required this.isVerified, required this.confidence});

  final bool isVerified;
  final double confidence;
}

/// Whether this user needs to redo selfie verification - either their
/// profile photo changed since it was last verified against, or enough time
/// has passed since the last successful check (see the backend's
/// VerificationService.getVerificationStatus).
class VerificationStatus {
  VerificationStatus({
    required this.isVerified,
    required this.verifiedAt,
    required this.reverificationDue,
    required this.reverificationReason,
  });

  final bool isVerified;
  final DateTime? verifiedAt;
  final bool reverificationDue;
  final String? reverificationReason;
}

/// Talks to the backend's live selfie verification endpoints. Requires a
/// signed-in user's access token.
class VerificationApi {
  VerificationApi({required this.accessToken, http.Client? client, String? baseUrl})
      : _client = client ?? http.Client(),
        _baseUrl = baseUrl ?? 'http://10.0.2.2:3000';

  final String accessToken;
  final http.Client _client;
  final String _baseUrl;

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $accessToken',
      };

  Future<VerificationStatus> fetchStatus() async {
    final response = await _client.get(
      Uri.parse('$_baseUrl/verification/selfie/status'),
      headers: _headers,
    );

    final body = _decode(response);
    if (response.statusCode != 200) {
      throw VerificationApiException(_errorMessage(body, response.statusCode));
    }

    return VerificationStatus(
      isVerified: body['isVerified'] as bool,
      verifiedAt: body['verifiedAt'] == null ? null : DateTime.parse(body['verifiedAt'] as String),
      reverificationDue: body['reverificationDue'] as bool,
      reverificationReason: body['reverificationReason'] as String?,
    );
  }

  Future<VerificationChallenge> requestChallenge() async {
    final response = await _client.post(
      Uri.parse('$_baseUrl/verification/selfie/challenge'),
      headers: _headers,
    );

    final body = _decode(response);
    if (response.statusCode != 200) {
      throw VerificationApiException(_errorMessage(body, response.statusCode));
    }

    return VerificationChallenge(
      challengeId: body['challengeId'] as String,
      gesture: body['gesture'] as String,
      expiresInSeconds: body['expiresInSeconds'] as int,
    );
  }

  Future<VerificationResult> submitSelfie({
    required String challengeId,
    required String selfieImageBase64,
  }) async {
    final response = await _client.post(
      Uri.parse('$_baseUrl/verification/selfie/submit'),
      headers: _headers,
      body: jsonEncode({'challengeId': challengeId, 'selfieImageBase64': selfieImageBase64}),
    );

    final body = _decode(response);
    if (response.statusCode != 200) {
      throw VerificationApiException(_errorMessage(body, response.statusCode));
    }

    return VerificationResult(
      isVerified: body['isVerified'] as bool,
      confidence: (body['confidence'] as num).toDouble(),
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
