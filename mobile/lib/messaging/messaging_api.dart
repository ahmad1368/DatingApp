import 'dart:convert';

import 'package:http/http.dart' as http;

class MessagingApiException implements Exception {
  MessagingApiException(this.message);

  final String message;

  @override
  String toString() => message;
}

class MatchStatus {
  MatchStatus({
    required this.matchId,
    this.expiresAt,
    required this.isExpired,
    required this.firstMessageSent,
    required this.canSendFirstMessage,
  });

  final String matchId;
  final DateTime? expiresAt;
  final bool isExpired;
  final bool firstMessageSent;
  final bool canSendFirstMessage;
}

class MatchSummary {
  MatchSummary({
    required this.matchId,
    required this.otherUserId,
    this.otherUserName,
    this.otherUserPhotoUrl,
    this.expiresAt,
    required this.firstMessageSent,
    required this.createdAt,
  });

  final String matchId;
  final String otherUserId;
  final String? otherUserName;
  final String? otherUserPhotoUrl;
  final DateTime? expiresAt;
  final bool firstMessageSent;
  final DateTime createdAt;
}

class ChatMessage {
  ChatMessage({
    required this.id,
    required this.senderId,
    required this.content,
    required this.createdAt,
  });

  final String id;
  final String senderId;
  final String content;
  final DateTime createdAt;
}

/// Talks to the backend's match/messaging endpoints. Requires a signed-in
/// user's access token.
class MessagingApi {
  MessagingApi({required this.accessToken, http.Client? client, String? baseUrl})
      : _client = client ?? http.Client(),
        _baseUrl = baseUrl ?? 'http://10.0.2.2:3000';

  final String accessToken;
  final http.Client _client;
  final String _baseUrl;

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $accessToken',
      };

  Future<List<MatchSummary>> fetchMyMatches() async {
    final response = await _client.get(
      Uri.parse('$_baseUrl/matches'),
      headers: _headers,
    );

    if (response.statusCode != 200) {
      throw MessagingApiException(_errorMessage(_decode(response), response.statusCode));
    }

    final list = jsonDecode(response.body) as List;
    return list.cast<Map<String, dynamic>>().map((json) {
      return MatchSummary(
        matchId: json['matchId'] as String,
        otherUserId: json['otherUserId'] as String,
        otherUserName: json['otherUserName'] as String?,
        otherUserPhotoUrl: json['otherUserPhotoUrl'] as String?,
        expiresAt: json['expiresAt'] != null ? DateTime.parse(json['expiresAt'] as String) : null,
        firstMessageSent: json['firstMessageSent'] as bool,
        createdAt: DateTime.parse(json['createdAt'] as String),
      );
    }).toList();
  }

  Future<MatchStatus> fetchMatchStatus(String matchId) async {
    final response = await _client.get(
      Uri.parse('$_baseUrl/matches/$matchId'),
      headers: _headers,
    );

    final body = _decode(response);
    if (response.statusCode != 200) {
      throw MessagingApiException(_errorMessage(body, response.statusCode));
    }

    return MatchStatus(
      matchId: body['matchId'] as String,
      expiresAt: body['expiresAt'] != null ? DateTime.parse(body['expiresAt'] as String) : null,
      isExpired: body['isExpired'] as bool,
      firstMessageSent: body['firstMessageSent'] as bool,
      canSendFirstMessage: body['canSendFirstMessage'] as bool,
    );
  }

  Future<List<ChatMessage>> fetchMessages(String matchId) async {
    final response = await _client.get(
      Uri.parse('$_baseUrl/matches/$matchId/messages'),
      headers: _headers,
    );

    if (response.statusCode != 200) {
      throw MessagingApiException(_errorMessage(_decode(response), response.statusCode));
    }

    final list = jsonDecode(response.body) as List;
    return list.cast<Map<String, dynamic>>().map(_toChatMessage).toList();
  }

  Future<ChatMessage> sendMessage({required String matchId, required String content}) async {
    final response = await _client.post(
      Uri.parse('$_baseUrl/matches/$matchId/messages'),
      headers: _headers,
      body: jsonEncode({'content': content}),
    );

    final body = _decode(response);
    if (response.statusCode != 201) {
      throw MessagingApiException(_errorMessage(body, response.statusCode));
    }

    return _toChatMessage(body);
  }

  ChatMessage _toChatMessage(Map<String, dynamic> json) {
    return ChatMessage(
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
