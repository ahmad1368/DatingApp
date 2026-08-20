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
    required this.contentType,
    this.content,
    this.mediaUrl,
    required this.isBlurred,
    this.readAt,
    required this.createdAt,
  });

  final String id;
  final String senderId;
  final String contentType;
  final String? content;
  final String? mediaUrl;
  final bool isBlurred;
  final DateTime? readAt;
  final DateTime createdAt;

  bool get isRead => readAt != null;
}

class GifResult {
  GifResult({required this.id, required this.url, required this.previewUrl});

  final String id;
  final String url;
  final String previewUrl;
}

class ModerationResult {
  ModerationResult({required this.flagged, required this.categories});

  final bool flagged;
  final List<String> categories;
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

  Future<ChatMessage> sendMediaMessage({
    required String matchId,
    required String contentType,
    required String mediaUrl,
  }) async {
    final response = await _client.post(
      Uri.parse('$_baseUrl/matches/$matchId/media'),
      headers: _headers,
      body: jsonEncode({'contentType': contentType, 'mediaUrl': mediaUrl}),
    );

    final body = _decode(response);
    if (response.statusCode != 201) {
      throw MessagingApiException(_errorMessage(body, response.statusCode));
    }

    return _toChatMessage(body);
  }

  Future<ChatMessage> revealImage({required String matchId, required String messageId}) async {
    final response = await _client.post(
      Uri.parse('$_baseUrl/matches/$matchId/messages/$messageId/reveal'),
      headers: _headers,
    );

    final body = _decode(response);
    if (response.statusCode != 200) {
      throw MessagingApiException(_errorMessage(body, response.statusCode));
    }

    return _toChatMessage(body);
  }

  Future<List<GifResult>> searchGifs(String query, {int? limit}) async {
    final params = <String, String>{'q': query};
    if (limit != null) {
      params['limit'] = limit.toString();
    }
    final response = await _client.get(
      Uri.parse('$_baseUrl/matches/gifs/search').replace(queryParameters: params),
      headers: _headers,
    );

    if (response.statusCode != 200) {
      throw MessagingApiException(_errorMessage(_decode(response), response.statusCode));
    }

    final list = jsonDecode(response.body) as List;
    return list
        .cast<Map<String, dynamic>>()
        .map(
          (json) => GifResult(
            id: json['id'] as String,
            url: json['url'] as String,
            previewUrl: json['previewUrl'] as String,
          ),
        )
        .toList();
  }

  /// Real-time pre-send check: call with a draft message so the UI can
  /// warn the user before they actually send something the AI moderator
  /// flags as potentially harassing or harmful.
  Future<ModerationResult> checkMessage(String text) async {
    final response = await _client.post(
      Uri.parse('$_baseUrl/matches/moderation/check'),
      headers: _headers,
      body: jsonEncode({'text': text}),
    );

    final body = _decode(response);
    if (response.statusCode != 200) {
      throw MessagingApiException(_errorMessage(body, response.statusCode));
    }

    return ModerationResult(
      flagged: body['flagged'] as bool,
      categories: (body['categories'] as List).cast<String>(),
    );
  }

  /// Privacy toggle: when disabled, this user's reads of other people's
  /// messages are never stamped, so senders never see a read receipt.
  Future<bool> setReadReceiptsEnabled(bool enabled) async {
    final response = await _client.put(
      Uri.parse('$_baseUrl/matches/read-receipts'),
      headers: _headers,
      body: jsonEncode({'enabled': enabled}),
    );

    final body = _decode(response);
    if (response.statusCode != 200) {
      throw MessagingApiException(_errorMessage(body, response.statusCode));
    }

    return body['readReceiptsEnabled'] as bool;
  }

  Future<void> reportMessage({
    required String matchId,
    required String messageId,
    required String reason,
  }) async {
    final response = await _client.post(
      Uri.parse('$_baseUrl/matches/$matchId/messages/$messageId/report'),
      headers: _headers,
      body: jsonEncode({'reason': reason}),
    );

    if (response.statusCode != 201) {
      throw MessagingApiException(_errorMessage(_decode(response), response.statusCode));
    }
  }

  ChatMessage _toChatMessage(Map<String, dynamic> json) {
    return ChatMessage(
      id: json['id'] as String,
      senderId: json['senderId'] as String,
      contentType: json['contentType'] as String,
      content: json['content'] as String?,
      mediaUrl: json['mediaUrl'] as String?,
      isBlurred: json['isBlurred'] as bool,
      readAt: json['readAt'] != null ? DateTime.parse(json['readAt'] as String) : null,
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
