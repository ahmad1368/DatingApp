import 'dart:convert';

import 'package:http/http.dart' as http;

class VaultApiException implements Exception {
  VaultApiException(this.message);

  final String message;

  @override
  String toString() => message;
}

class VaultPhoto {
  VaultPhoto({
    required this.id,
    required this.mediaUrl,
    required this.createdAt,
    required this.grantedMatchIds,
  });

  final String id;
  final String mediaUrl;
  final DateTime createdAt;
  final List<String> grantedMatchIds;
}

class GrantedVaultPhoto {
  GrantedVaultPhoto({required this.id, required this.mediaUrl, required this.grantedAt});

  final String id;
  final String mediaUrl;
  final DateTime grantedAt;
}

/// Talks to the backend's private photo vault endpoints. Requires a
/// signed-in user's access token.
class VaultApi {
  VaultApi({required this.accessToken, http.Client? client, String? baseUrl})
      : _client = client ?? http.Client(),
        _baseUrl = baseUrl ?? 'http://10.0.2.2:3000';

  final String accessToken;
  final http.Client _client;
  final String _baseUrl;

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $accessToken',
      };

  Future<List<VaultPhoto>> fetchMyPhotos() async {
    final response = await _client.get(Uri.parse('$_baseUrl/vault/photos'), headers: _headers);

    if (response.statusCode != 200) {
      throw VaultApiException(_errorMessage(_decode(response), response.statusCode));
    }

    final list = jsonDecode(response.body) as List;
    return list.cast<Map<String, dynamic>>().map(_toVaultPhoto).toList();
  }

  Future<VaultPhoto> addPhoto(String mediaUrl) async {
    final response = await _client.post(
      Uri.parse('$_baseUrl/vault/photos'),
      headers: _headers,
      body: jsonEncode({'mediaUrl': mediaUrl}),
    );

    final body = _decode(response);
    if (response.statusCode != 201) {
      throw VaultApiException(_errorMessage(body, response.statusCode));
    }

    return _toVaultPhoto(body);
  }

  Future<void> deletePhoto(String photoId) async {
    final response = await _client.delete(
      Uri.parse('$_baseUrl/vault/photos/$photoId'),
      headers: _headers,
    );

    if (response.statusCode != 200) {
      throw VaultApiException(_errorMessage(_decode(response), response.statusCode));
    }
  }

  Future<void> grantAccess(String photoId, String matchId) async {
    final response = await _client.post(
      Uri.parse('$_baseUrl/vault/photos/$photoId/grant'),
      headers: _headers,
      body: jsonEncode({'matchId': matchId}),
    );

    if (response.statusCode != 200) {
      throw VaultApiException(_errorMessage(_decode(response), response.statusCode));
    }
  }

  Future<void> revokeAccess(String photoId, String matchId) async {
    final response = await _client.post(
      Uri.parse('$_baseUrl/vault/photos/$photoId/revoke'),
      headers: _headers,
      body: jsonEncode({'matchId': matchId}),
    );

    if (response.statusCode != 200) {
      throw VaultApiException(_errorMessage(_decode(response), response.statusCode));
    }
  }

  /// The photos the current user's match partner has granted them access to.
  Future<List<GrantedVaultPhoto>> fetchGrantedPhotos(String matchId) async {
    final response = await _client.get(
      Uri.parse('$_baseUrl/vault/matches/$matchId'),
      headers: _headers,
    );

    if (response.statusCode != 200) {
      throw VaultApiException(_errorMessage(_decode(response), response.statusCode));
    }

    final list = jsonDecode(response.body) as List;
    return list.cast<Map<String, dynamic>>().map((json) {
      return GrantedVaultPhoto(
        id: json['id'] as String,
        mediaUrl: json['mediaUrl'] as String,
        grantedAt: DateTime.parse(json['grantedAt'] as String),
      );
    }).toList();
  }

  VaultPhoto _toVaultPhoto(Map<String, dynamic> json) {
    return VaultPhoto(
      id: json['id'] as String,
      mediaUrl: json['mediaUrl'] as String,
      createdAt: DateTime.parse(json['createdAt'] as String),
      grantedMatchIds: (json['grantedMatchIds'] as List?)?.cast<String>() ?? const [],
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
