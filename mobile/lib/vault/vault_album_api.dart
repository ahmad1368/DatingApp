import 'dart:convert';

import 'package:http/http.dart' as http;

class VaultAlbumApiException implements Exception {
  VaultAlbumApiException(this.message);

  final String message;

  @override
  String toString() => message;
}

class VaultAlbum {
  VaultAlbum({
    required this.id,
    required this.name,
    required this.createdAt,
    required this.photoIds,
    required this.grantedMatchIds,
  });

  final String id;
  final String name;
  final DateTime createdAt;
  final List<String> photoIds;
  final List<String> grantedMatchIds;
}

class GrantedVaultAlbumPhoto {
  GrantedVaultAlbumPhoto({required this.id, required this.mediaUrl});

  final String id;
  final String mediaUrl;
}

class GrantedVaultAlbum {
  GrantedVaultAlbum({
    required this.id,
    required this.name,
    required this.grantedAt,
    this.expiresAt,
    required this.photos,
  });

  final String id;
  final String name;
  final DateTime grantedAt;
  final DateTime? expiresAt;
  final List<GrantedVaultAlbumPhoto> photos;
}

/// Talks to the backend's private photo vault album ("gallery") endpoints:
/// grouping vault photos so a whole set can be locked/unlocked for a match
/// in one grant instead of one per photo. Requires a signed-in user's
/// access token.
class VaultAlbumApi {
  VaultAlbumApi({required this.accessToken, http.Client? client, String? baseUrl})
      : _client = client ?? http.Client(),
        _baseUrl = baseUrl ?? 'http://10.0.2.2:3000';

  final String accessToken;
  final http.Client _client;
  final String _baseUrl;

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $accessToken',
      };

  Future<List<VaultAlbum>> fetchMyAlbums() async {
    final response = await _client.get(Uri.parse('$_baseUrl/vault/albums'), headers: _headers);

    if (response.statusCode != 200) {
      throw VaultAlbumApiException(_errorMessage(_decode(response), response.statusCode));
    }

    final list = jsonDecode(response.body) as List;
    return list.cast<Map<String, dynamic>>().map(_toVaultAlbum).toList();
  }

  Future<VaultAlbum> createAlbum(String name) async {
    final response = await _client.post(
      Uri.parse('$_baseUrl/vault/albums'),
      headers: _headers,
      body: jsonEncode({'name': name}),
    );

    final body = _decode(response);
    if (response.statusCode != 201) {
      throw VaultAlbumApiException(_errorMessage(body, response.statusCode));
    }

    return _toVaultAlbum(body);
  }

  Future<void> deleteAlbum(String albumId) async {
    final response = await _client.delete(
      Uri.parse('$_baseUrl/vault/albums/$albumId'),
      headers: _headers,
    );

    if (response.statusCode != 200) {
      throw VaultAlbumApiException(_errorMessage(_decode(response), response.statusCode));
    }
  }

  /// Omit [expiresInHours] for a permanent grant; otherwise the key expires
  /// after this many hours (see the backend's MIN/MAX_GRANT_EXPIRY_HOURS).
  Future<void> grantAccess(String albumId, String matchId, {int? expiresInHours}) async {
    final response = await _client.post(
      Uri.parse('$_baseUrl/vault/albums/$albumId/grant'),
      headers: _headers,
      body: jsonEncode({'matchId': matchId, 'expiresInHours': ?expiresInHours}),
    );

    if (response.statusCode != 200) {
      throw VaultAlbumApiException(_errorMessage(_decode(response), response.statusCode));
    }
  }

  Future<void> revokeAccess(String albumId, String matchId) async {
    final response = await _client.post(
      Uri.parse('$_baseUrl/vault/albums/$albumId/revoke'),
      headers: _headers,
      body: jsonEncode({'matchId': matchId}),
    );

    if (response.statusCode != 200) {
      throw VaultAlbumApiException(_errorMessage(_decode(response), response.statusCode));
    }
  }

  /// The albums the current user's match partner has granted them access to.
  Future<List<GrantedVaultAlbum>> fetchGrantedAlbums(String matchId) async {
    final response = await _client.get(
      Uri.parse('$_baseUrl/vault/albums/matches/$matchId'),
      headers: _headers,
    );

    if (response.statusCode != 200) {
      throw VaultAlbumApiException(_errorMessage(_decode(response), response.statusCode));
    }

    final list = jsonDecode(response.body) as List;
    return list.cast<Map<String, dynamic>>().map((json) {
      final photos = (json['photos'] as List).cast<Map<String, dynamic>>();
      return GrantedVaultAlbum(
        id: json['id'] as String,
        name: json['name'] as String,
        grantedAt: DateTime.parse(json['grantedAt'] as String),
        expiresAt: json['expiresAt'] != null ? DateTime.parse(json['expiresAt'] as String) : null,
        photos: photos
            .map((photo) => GrantedVaultAlbumPhoto(
                  id: photo['id'] as String,
                  mediaUrl: photo['mediaUrl'] as String,
                ))
            .toList(),
      );
    }).toList();
  }

  VaultAlbum _toVaultAlbum(Map<String, dynamic> json) {
    return VaultAlbum(
      id: json['id'] as String,
      name: json['name'] as String,
      createdAt: DateTime.parse(json['createdAt'] as String),
      photoIds: (json['photoIds'] as List?)?.cast<String>() ?? const [],
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
