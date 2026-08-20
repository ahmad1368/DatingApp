import 'dart:convert';

import 'package:http/http.dart' as http;

class BlockingApiException implements Exception {
  BlockingApiException(this.message);

  final String message;

  @override
  String toString() => message;
}

class SyncContactsResult {
  SyncContactsResult({required this.totalSubmitted, required this.matchedUsers});

  final int totalSubmitted;
  final int matchedUsers;
}

class BlockedContact {
  BlockedContact({
    required this.id,
    required this.contactValue,
    this.blockedUserId,
    this.blockedUserName,
    this.blockedUserPhotoUrl,
    required this.createdAt,
  });

  final String id;
  final String contactValue;
  final String? blockedUserId;
  final String? blockedUserName;
  final String? blockedUserPhotoUrl;
  final DateTime createdAt;

  bool get isAppUser => blockedUserId != null;
}

/// Talks to the backend's contact-blocking ("privacy shield") endpoints.
/// Requires a signed-in user's access token.
class BlockingApi {
  BlockingApi({required this.accessToken, http.Client? client, String? baseUrl})
      : _client = client ?? http.Client(),
        _baseUrl = baseUrl ?? 'http://10.0.2.2:3000';

  final String accessToken;
  final http.Client _client;
  final String _baseUrl;

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $accessToken',
      };

  /// Uploads/syncs a batch of phone numbers or emails to block. Any contact
  /// that matches an existing account is blocked from seeing or appearing
  /// in this user's discovery feed, and vice versa.
  Future<SyncContactsResult> syncContacts(List<String> contacts) async {
    final response = await _client.post(
      Uri.parse('$_baseUrl/blocking/sync-contacts'),
      headers: _headers,
      body: jsonEncode({'contacts': contacts}),
    );

    final body = _decode(response);
    if (response.statusCode != 200) {
      throw BlockingApiException(_errorMessage(body, response.statusCode));
    }

    return SyncContactsResult(
      totalSubmitted: body['totalSubmitted'] as int,
      matchedUsers: body['matchedUsers'] as int,
    );
  }

  Future<List<BlockedContact>> fetchBlockedContacts() async {
    final response = await _client.get(
      Uri.parse('$_baseUrl/blocking/blocked-contacts'),
      headers: _headers,
    );

    if (response.statusCode != 200) {
      throw BlockingApiException(_errorMessage(_decode(response), response.statusCode));
    }

    final list = jsonDecode(response.body) as List;
    return list
        .cast<Map<String, dynamic>>()
        .map(
          (json) => BlockedContact(
            id: json['id'] as String,
            contactValue: json['contactValue'] as String,
            blockedUserId: json['blockedUserId'] as String?,
            blockedUserName: json['blockedUserName'] as String?,
            blockedUserPhotoUrl: json['blockedUserPhotoUrl'] as String?,
            createdAt: DateTime.parse(json['createdAt'] as String),
          ),
        )
        .toList();
  }

  Future<void> unblockContact(String blockedContactId) async {
    final response = await _client.delete(
      Uri.parse('$_baseUrl/blocking/blocked-contacts/$blockedContactId'),
      headers: _headers,
    );

    if (response.statusCode != 200) {
      throw BlockingApiException(_errorMessage(_decode(response), response.statusCode));
    }
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
