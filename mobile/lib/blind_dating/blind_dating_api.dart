import 'dart:convert';

import 'package:http/http.dart' as http;

class BlindDatingApiException implements Exception {
  BlindDatingApiException(this.message);

  final String message;

  @override
  String toString() => message;
}

class RevealedProfile {
  RevealedProfile({required this.id, this.name, this.profilePhotoUrl});

  final String id;
  final String? name;
  final String? profilePhotoUrl;
}

class BlindDateStatus {
  BlindDateStatus({
    required this.status,
    this.sessionId,
    this.expiresAt,
    required this.isRevealed,
    required this.myRevealRequested,
    required this.otherRevealRequested,
    this.otherProfile,
  });

  final String status;
  final String? sessionId;
  final DateTime? expiresAt;
  final bool isRevealed;
  final bool myRevealRequested;
  final bool otherRevealRequested;
  final RevealedProfile? otherProfile;

  bool get isWaiting => status == 'WAITING';
  bool get isActive => status == 'ACTIVE';
  bool get isEnded => status == 'ENDED';
}

class BlindDateMessage {
  BlindDateMessage({required this.id, required this.senderId, required this.content, required this.createdAt});

  final String id;
  final String senderId;
  final String content;
  final DateTime createdAt;
}

/// Talks to the backend's blind-dating (speed dating) endpoints. Requires
/// a signed-in user's access token.
class BlindDatingApi {
  BlindDatingApi({required this.accessToken, http.Client? client, String? baseUrl})
      : _client = client ?? http.Client(),
        _baseUrl = baseUrl ?? 'http://10.0.2.2:3000';

  final String accessToken;
  final http.Client _client;
  final String _baseUrl;

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $accessToken',
      };

  Future<BlindDateStatus> fetchStatus() async {
    final response = await _client.get(
      Uri.parse('$_baseUrl/blind-dating/status'),
      headers: _headers,
    );

    return _parseStatus(response);
  }

  Future<BlindDateStatus> joinQueue() async {
    final response = await _client.post(
      Uri.parse('$_baseUrl/blind-dating/queue/join'),
      headers: _headers,
    );

    return _parseStatus(response);
  }

  Future<void> leaveQueue() async {
    final response = await _client.post(
      Uri.parse('$_baseUrl/blind-dating/queue/leave'),
      headers: _headers,
    );

    if (response.statusCode != 200) {
      throw BlindDatingApiException(_errorMessage(_decode(response), response.statusCode));
    }
  }

  Future<List<BlindDateMessage>> fetchMessages(String sessionId) async {
    final response = await _client.get(
      Uri.parse('$_baseUrl/blind-dating/sessions/$sessionId/messages'),
      headers: _headers,
    );

    if (response.statusCode != 200) {
      throw BlindDatingApiException(_errorMessage(_decode(response), response.statusCode));
    }

    final list = jsonDecode(response.body) as List;
    return list.cast<Map<String, dynamic>>().map(_toMessage).toList();
  }

  Future<BlindDateMessage> sendMessage({required String sessionId, required String content}) async {
    final response = await _client.post(
      Uri.parse('$_baseUrl/blind-dating/sessions/$sessionId/messages'),
      headers: _headers,
      body: jsonEncode({'content': content}),
    );

    final body = _decode(response);
    if (response.statusCode != 201) {
      throw BlindDatingApiException(_errorMessage(body, response.statusCode));
    }

    return _toMessage(body);
  }

  Future<BlindDateStatus> requestReveal(String sessionId) async {
    final response = await _client.post(
      Uri.parse('$_baseUrl/blind-dating/sessions/$sessionId/reveal'),
      headers: _headers,
    );

    return _parseStatus(response);
  }

  BlindDateStatus _parseStatus(http.Response response) {
    final body = _decode(response);
    if (response.statusCode != 200) {
      throw BlindDatingApiException(_errorMessage(body, response.statusCode));
    }

    final otherProfileJson = body['otherProfile'] as Map<String, dynamic>?;
    return BlindDateStatus(
      status: body['status'] as String,
      sessionId: body['sessionId'] as String?,
      expiresAt: body['expiresAt'] != null ? DateTime.parse(body['expiresAt'] as String) : null,
      isRevealed: body['isRevealed'] as bool,
      myRevealRequested: body['myRevealRequested'] as bool,
      otherRevealRequested: body['otherRevealRequested'] as bool,
      otherProfile: otherProfileJson != null
          ? RevealedProfile(
              id: otherProfileJson['id'] as String,
              name: otherProfileJson['name'] as String?,
              profilePhotoUrl: otherProfileJson['profilePhotoUrl'] as String?,
            )
          : null,
    );
  }

  BlindDateMessage _toMessage(Map<String, dynamic> json) {
    return BlindDateMessage(
      id: json['id'] as String,
      senderId: json['senderId'] as String,
      content: json['content'] as String,
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
