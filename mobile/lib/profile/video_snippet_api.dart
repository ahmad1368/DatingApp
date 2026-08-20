import 'dart:convert';

import 'package:http/http.dart' as http;

class VideoSnippetApiException implements Exception {
  VideoSnippetApiException(this.message);

  final String message;

  @override
  String toString() => message;
}

class VideoSnippetResult {
  VideoSnippetResult({this.url});

  final String? url;
}

/// Talks to the backend's video snippet ("looping video header") endpoints.
/// Requires a signed-in user's access token.
class VideoSnippetApi {
  VideoSnippetApi({required this.accessToken, http.Client? client, String? baseUrl})
      : _client = client ?? http.Client(),
        _baseUrl = baseUrl ?? 'http://10.0.2.2:3000';

  final String accessToken;
  final http.Client _client;
  final String _baseUrl;

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $accessToken',
      };

  Future<VideoSnippetResult> fetchVideoSnippet() async {
    final response = await _client.get(
      Uri.parse('$_baseUrl/profile/video-snippet'),
      headers: _headers,
    );

    return _parse(response);
  }

  Future<VideoSnippetResult> setVideoSnippet({required String url}) async {
    final response = await _client.put(
      Uri.parse('$_baseUrl/profile/video-snippet'),
      headers: _headers,
      body: jsonEncode({'url': url}),
    );

    return _parse(response);
  }

  Future<VideoSnippetResult> clearVideoSnippet() async {
    final response = await _client.delete(
      Uri.parse('$_baseUrl/profile/video-snippet'),
      headers: _headers,
    );

    return _parse(response);
  }

  VideoSnippetResult _parse(http.Response response) {
    final body = _decode(response);
    if (response.statusCode != 200) {
      throw VideoSnippetApiException(_errorMessage(body, response.statusCode));
    }

    return VideoSnippetResult(url: body['url'] as String?);
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
