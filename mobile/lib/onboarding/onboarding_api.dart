import 'dart:convert';

import 'package:http/http.dart' as http;

class OnboardingApiException implements Exception {
  OnboardingApiException(this.message);

  final String message;

  @override
  String toString() => message;
}

class OnboardingResult {
  OnboardingResult({
    required this.id,
    this.name,
    required this.dateOfBirth,
    required this.relationshipGoal,
    required this.interests,
  });

  final String id;
  final String? name;
  final String dateOfBirth;
  final String relationshipGoal;
  final List<String> interests;
}

/// Talks to the backend's onboarding endpoint. Requires a signed-in user's
/// access token.
class OnboardingApi {
  OnboardingApi({required this.accessToken, http.Client? client, String? baseUrl})
      : _client = client ?? http.Client(),
        _baseUrl = baseUrl ?? 'http://10.0.2.2:3000';

  final String accessToken;
  final http.Client _client;
  final String _baseUrl;

  Future<OnboardingResult> completeOnboarding({
    String? name,
    required String dateOfBirth,
    required String relationshipGoal,
    required List<String> interests,
  }) async {
    final response = await _client.put(
      Uri.parse('$_baseUrl/onboarding'),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $accessToken',
      },
      body: jsonEncode({
        'name': ?name,
        'dateOfBirth': dateOfBirth,
        'relationshipGoal': relationshipGoal,
        'interests': interests,
      }),
    );

    final body = _decode(response);
    if (response.statusCode != 200) {
      throw OnboardingApiException(_errorMessage(body, response.statusCode));
    }

    return OnboardingResult(
      id: body['id'] as String,
      name: body['name'] as String?,
      dateOfBirth: body['dateOfBirth'] as String,
      relationshipGoal: body['relationshipGoal'] as String,
      interests: (body['interests'] as List).cast<String>(),
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
