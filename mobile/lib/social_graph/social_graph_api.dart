import 'dart:convert';

import 'package:http/http.dart' as http;

class SocialGraphApiException implements Exception {
  SocialGraphApiException(this.message);

  final String message;

  @override
  String toString() => message;
}

class SyncSocialContactsResult {
  SyncSocialContactsResult({required this.totalSynced});

  final int totalSynced;
}

/// Talks to the backend's social-graph endpoints: syncing the user's own
/// address book so mutual connections can be highlighted on candidate cards.
class SocialGraphApi {
  SocialGraphApi({required this.accessToken, http.Client? client, String? baseUrl})
      : _client = client ?? http.Client(),
        _baseUrl = baseUrl ?? 'http://10.0.2.2:3000';

  final String accessToken;
  final http.Client _client;
  final String _baseUrl;

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $accessToken',
      };

  /// Replaces the user's synced contact list with [contacts] (phone numbers
  /// or emails). A contact removed from a later sync stops counting toward
  /// mutual connections.
  Future<SyncSocialContactsResult> syncContacts(List<String> contacts) async {
    final response = await _client.post(
      Uri.parse('$_baseUrl/social-graph/contacts'),
      headers: _headers,
      body: jsonEncode({'contacts': contacts}),
    );

    final body = _decode(response);
    if (response.statusCode != 200) {
      throw SocialGraphApiException(_errorMessage(body, response.statusCode));
    }

    return SyncSocialContactsResult(totalSynced: body['totalSynced'] as int);
  }

  /// Privacy toggle: when enabled, this user is excluded from the deck of
  /// anyone who shares a synced contact with them, i.e. hidden from direct
  /// contacts, mutual friends, and phonebook entries connected to them.
  Future<bool> setHideFromMutualConnections(bool enabled) async {
    final response = await _client.put(
      Uri.parse('$_baseUrl/social-graph/hide-from-mutual-connections'),
      headers: _headers,
      body: jsonEncode({'enabled': enabled}),
    );

    final body = _decode(response);
    if (response.statusCode != 200) {
      throw SocialGraphApiException(_errorMessage(body, response.statusCode));
    }

    return body['hideFromMutualConnectionsEnabled'] as bool;
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
