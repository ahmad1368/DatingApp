import 'dart:convert';

import 'package:http/http.dart' as http;

class ProfilePromptsApiException implements Exception {
  ProfilePromptsApiException(this.message);

  final String message;

  @override
  String toString() => message;
}

class ProfilePrompt {
  ProfilePrompt({required this.id, required this.question});

  final String id;
  final String question;
}

class VoicePromptAnswer {
  VoicePromptAnswer({
    required this.promptId,
    required this.question,
    required this.audioUrl,
    required this.durationSeconds,
    this.transcript,
    required this.createdAt,
  });

  final String promptId;
  final String question;
  final String audioUrl;
  final int durationSeconds;
  /// Auto-generated caption for accessibility and silent browsing - null if
  /// transcription failed or hasn't run yet.
  final String? transcript;
  final DateTime createdAt;
}

class VideoPromptAnswer {
  VideoPromptAnswer({
    required this.promptId,
    required this.question,
    required this.videoUrl,
    required this.durationSeconds,
    required this.createdAt,
  });

  final String promptId;
  final String question;
  final String videoUrl;
  final int durationSeconds;
  final DateTime createdAt;
}

/// Talks to the backend's voice-answer profile prompt endpoints.
class ProfilePromptsApi {
  ProfilePromptsApi({required this.accessToken, http.Client? client, String? baseUrl})
      : _client = client ?? http.Client(),
        _baseUrl = baseUrl ?? 'http://10.0.2.2:3000';

  final String accessToken;
  final http.Client _client;
  final String _baseUrl;

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $accessToken',
      };

  Future<List<ProfilePrompt>> fetchPrompts() async {
    final response = await _client.get(
      Uri.parse('$_baseUrl/profile-prompts/items'),
      headers: _headers,
    );

    if (response.statusCode != 200) {
      throw ProfilePromptsApiException(_errorMessage(_decode(response), response.statusCode));
    }

    final list = jsonDecode(response.body) as List;
    return list
        .cast<Map<String, dynamic>>()
        .map((json) => ProfilePrompt(id: json['id'] as String, question: json['question'] as String))
        .toList();
  }

  Future<List<VoicePromptAnswer>> fetchMyAnswers() async {
    final response = await _client.get(
      Uri.parse('$_baseUrl/profile-prompts/me'),
      headers: _headers,
    );

    if (response.statusCode != 200) {
      throw ProfilePromptsApiException(_errorMessage(_decode(response), response.statusCode));
    }

    final list = jsonDecode(response.body) as List;
    return list.cast<Map<String, dynamic>>().map(_toVoicePromptAnswer).toList();
  }

  Future<List<VoicePromptAnswer>> fetchAnswersForUser(String userId) async {
    final response = await _client.get(
      Uri.parse('$_baseUrl/profile-prompts/$userId'),
      headers: _headers,
    );

    if (response.statusCode != 200) {
      throw ProfilePromptsApiException(_errorMessage(_decode(response), response.statusCode));
    }

    final list = jsonDecode(response.body) as List;
    return list.cast<Map<String, dynamic>>().map(_toVoicePromptAnswer).toList();
  }

  Future<VoicePromptAnswer> recordAnswer({
    required String promptId,
    required String audioUrl,
    required int durationSeconds,
  }) async {
    final response = await _client.post(
      Uri.parse('$_baseUrl/profile-prompts/answers'),
      headers: _headers,
      body: jsonEncode({
        'promptId': promptId,
        'audioUrl': audioUrl,
        'durationSeconds': durationSeconds,
      }),
    );

    if (response.statusCode != 200) {
      throw ProfilePromptsApiException(_errorMessage(_decode(response), response.statusCode));
    }

    return _toVoicePromptAnswer(_decode(response));
  }

  Future<void> deleteAnswer(String promptId) async {
    final response = await _client.delete(
      Uri.parse('$_baseUrl/profile-prompts/answers/$promptId'),
      headers: _headers,
    );

    if (response.statusCode != 200) {
      throw ProfilePromptsApiException(_errorMessage(_decode(response), response.statusCode));
    }
  }

  Future<List<VideoPromptAnswer>> fetchMyVideoAnswers() async {
    final response = await _client.get(
      Uri.parse('$_baseUrl/profile-prompts/video/me'),
      headers: _headers,
    );

    if (response.statusCode != 200) {
      throw ProfilePromptsApiException(_errorMessage(_decode(response), response.statusCode));
    }

    final list = jsonDecode(response.body) as List;
    return list.cast<Map<String, dynamic>>().map(_toVideoPromptAnswer).toList();
  }

  Future<List<VideoPromptAnswer>> fetchVideoAnswersForUser(String userId) async {
    final response = await _client.get(
      Uri.parse('$_baseUrl/profile-prompts/video/$userId'),
      headers: _headers,
    );

    if (response.statusCode != 200) {
      throw ProfilePromptsApiException(_errorMessage(_decode(response), response.statusCode));
    }

    final list = jsonDecode(response.body) as List;
    return list.cast<Map<String, dynamic>>().map(_toVideoPromptAnswer).toList();
  }

  /// Records or re-records a short (max 15 second, server-enforced) video
  /// answer to a prompt - independent of any voice answer to the same prompt.
  Future<VideoPromptAnswer> recordVideoAnswer({
    required String promptId,
    required String videoUrl,
    required int durationSeconds,
  }) async {
    final response = await _client.post(
      Uri.parse('$_baseUrl/profile-prompts/video-answers'),
      headers: _headers,
      body: jsonEncode({
        'promptId': promptId,
        'videoUrl': videoUrl,
        'durationSeconds': durationSeconds,
      }),
    );

    if (response.statusCode != 200) {
      throw ProfilePromptsApiException(_errorMessage(_decode(response), response.statusCode));
    }

    return _toVideoPromptAnswer(_decode(response));
  }

  Future<void> deleteVideoAnswer(String promptId) async {
    final response = await _client.delete(
      Uri.parse('$_baseUrl/profile-prompts/video-answers/$promptId'),
      headers: _headers,
    );

    if (response.statusCode != 200) {
      throw ProfilePromptsApiException(_errorMessage(_decode(response), response.statusCode));
    }
  }

  VideoPromptAnswer _toVideoPromptAnswer(Map<String, dynamic> json) {
    return VideoPromptAnswer(
      promptId: json['promptId'] as String,
      question: json['question'] as String,
      videoUrl: json['videoUrl'] as String,
      durationSeconds: json['durationSeconds'] as int,
      createdAt: DateTime.parse(json['createdAt'] as String),
    );
  }

  VoicePromptAnswer _toVoicePromptAnswer(Map<String, dynamic> json) {
    return VoicePromptAnswer(
      promptId: json['promptId'] as String,
      question: json['question'] as String,
      audioUrl: json['audioUrl'] as String,
      durationSeconds: json['durationSeconds'] as int,
      transcript: json['transcript'] as String?,
      createdAt: DateTime.parse(json['createdAt'] as String),
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
