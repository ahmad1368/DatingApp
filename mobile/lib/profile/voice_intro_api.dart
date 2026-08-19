import 'dart:convert';

import 'package:http/http.dart' as http;

class VoiceIntroApiException implements Exception {
  VoiceIntroApiException(this.message);

  final String message;

  @override
  String toString() => message;
}

class VoiceIntroResult {
  VoiceIntroResult({this.url, this.durationSeconds});

  final String? url;
  final int? durationSeconds;
}

/// Talks to the backend's voice intro endpoints. Requires a signed-in
/// user's access token.
class VoiceIntroApi {
  VoiceIntroApi({required this.accessToken, http.Client? client, String? baseUrl})
      : _client = client ?? http.Client(),
        _baseUrl = baseUrl ?? 'http://10.0.2.2:3000';

  final String accessToken;
  final http.Client _client;
  final String _baseUrl;

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $accessToken',
      };

  Future<VoiceIntroResult> fetchVoiceIntro() async {
    final response = await _client.get(
      Uri.parse('$_baseUrl/profile/voice-intro'),
      headers: _headers,
    );

    return _parse(response);
  }

  Future<VoiceIntroResult> setVoiceIntro({required String url, required int durationSeconds}) async {
    final response = await _client.put(
      Uri.parse('$_baseUrl/profile/voice-intro'),
      headers: _headers,
      body: jsonEncode({'url': url, 'durationSeconds': durationSeconds}),
    );

    return _parse(response);
  }

  Future<VoiceIntroResult> clearVoiceIntro() async {
    final response = await _client.delete(
      Uri.parse('$_baseUrl/profile/voice-intro'),
      headers: _headers,
    );

    return _parse(response);
  }

  VoiceIntroResult _parse(http.Response response) {
    final body = _decode(response);
    if (response.statusCode != 200) {
      throw VoiceIntroApiException(_errorMessage(body, response.statusCode));
    }

    return VoiceIntroResult(
      url: body['url'] as String?,
      durationSeconds: body['durationSeconds'] as int?,
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
