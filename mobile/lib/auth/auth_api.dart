import 'dart:convert';

import 'package:http/http.dart' as http;

class AuthApiException implements Exception {
  AuthApiException(this.message);

  final String message;

  @override
  String toString() => message;
}

class OtpRequestResult {
  OtpRequestResult({required this.expiresInSeconds, required this.resendCooldownSeconds});

  final int expiresInSeconds;
  final int resendCooldownSeconds;
}

class AuthResult {
  AuthResult({
    required this.accessToken,
    required this.userId,
    this.phoneNumber,
    this.email,
    this.name,
    this.avatarUrl,
  });

  final String accessToken;
  final String userId;
  final String? phoneNumber;
  final String? email;
  final String? name;
  final String? avatarUrl;
}

/// Talks to the backend's phone number + SMS OTP and Google OAuth
/// authentication endpoints.
class AuthApi {
  AuthApi({http.Client? client, String? baseUrl})
      : _client = client ?? http.Client(),
        _baseUrl = baseUrl ?? 'http://10.0.2.2:3000';

  final http.Client _client;
  final String _baseUrl;

  Future<OtpRequestResult> requestOtp(String phoneNumber) async {
    final response = await _client.post(
      Uri.parse('$_baseUrl/auth/otp/request'),
      headers: const {'Content-Type': 'application/json'},
      body: jsonEncode({'phoneNumber': phoneNumber}),
    );

    final body = _decode(response);
    if (response.statusCode != 200) {
      throw AuthApiException(_errorMessage(body, response.statusCode));
    }

    return OtpRequestResult(
      expiresInSeconds: body['expiresInSeconds'] as int,
      resendCooldownSeconds: body['resendCooldownSeconds'] as int,
    );
  }

  Future<AuthResult> verifyOtp(String phoneNumber, String code) async {
    final response = await _client.post(
      Uri.parse('$_baseUrl/auth/otp/verify'),
      headers: const {'Content-Type': 'application/json'},
      body: jsonEncode({'phoneNumber': phoneNumber, 'code': code}),
    );

    final body = _decode(response);
    if (response.statusCode != 200) {
      throw AuthApiException(_errorMessage(body, response.statusCode));
    }

    final user = body['user'] as Map<String, dynamic>;
    return AuthResult(
      accessToken: body['accessToken'] as String,
      userId: user['id'] as String,
      phoneNumber: user['phoneNumber'] as String,
    );
  }

  Future<AuthResult> loginWithGoogle(String idToken) async {
    final response = await _client.post(
      Uri.parse('$_baseUrl/auth/google'),
      headers: const {'Content-Type': 'application/json'},
      body: jsonEncode({'idToken': idToken}),
    );

    final body = _decode(response);
    if (response.statusCode != 200) {
      throw AuthApiException(_errorMessage(body, response.statusCode));
    }

    final user = body['user'] as Map<String, dynamic>;
    return AuthResult(
      accessToken: body['accessToken'] as String,
      userId: user['id'] as String,
      email: user['email'] as String?,
      name: user['name'] as String?,
      avatarUrl: user['avatarUrl'] as String?,
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
