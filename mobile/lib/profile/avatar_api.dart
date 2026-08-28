import 'dart:convert';

import 'package:http/http.dart' as http;

class AvatarApiException implements Exception {
  AvatarApiException(this.message);

  final String message;

  @override
  String toString() => message;
}

class AvatarStyle {
  AvatarStyle({required this.id, required this.label, required this.previewUrl});

  final String id;
  final String label;
  final String previewUrl;
}

/// A user's profile header avatar: either a curated 3D style picked from
/// the catalog, or a linked third-party avatar image (e.g. Bitmoji) -
/// mutually exclusive, only one is ever set.
class Avatar {
  Avatar({this.avatarStyleId, this.thirdPartyAvatarUrl, required this.showAvatarOnProfile});

  final String? avatarStyleId;
  final String? thirdPartyAvatarUrl;
  final bool showAvatarOnProfile;

  bool get hasAvatar => avatarStyleId != null || thirdPartyAvatarUrl != null;
}

/// Talks to the backend's profile/avatar endpoints.
class AvatarApi {
  AvatarApi({required this.accessToken, http.Client? client, String? baseUrl})
      : _client = client ?? http.Client(),
        _baseUrl = baseUrl ?? 'http://10.0.2.2:3000';

  final String accessToken;
  final http.Client _client;
  final String _baseUrl;

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $accessToken',
      };

  Future<List<AvatarStyle>> fetchStyleCatalog() async {
    final response = await _client.get(
      Uri.parse('$_baseUrl/profile/avatar/styles'),
      headers: _headers,
    );

    if (response.statusCode != 200) {
      throw AvatarApiException(_errorMessage(_decode(response), response.statusCode));
    }

    final list = jsonDecode(response.body) as List;
    return list.cast<Map<String, dynamic>>().map((json) {
      return AvatarStyle(
        id: json['id'] as String,
        label: json['label'] as String,
        previewUrl: json['previewUrl'] as String,
      );
    }).toList();
  }

  Future<Avatar> fetchMyAvatar() async {
    final response = await _client.get(Uri.parse('$_baseUrl/profile/avatar'), headers: _headers);

    final body = _decode(response);
    if (response.statusCode != 200) {
      throw AvatarApiException(_errorMessage(body, response.statusCode));
    }

    return _toAvatar(body);
  }

  Future<Avatar> selectAvatarStyle(String avatarStyleId) async {
    final response = await _client.put(
      Uri.parse('$_baseUrl/profile/avatar/style'),
      headers: _headers,
      body: jsonEncode({'avatarStyleId': avatarStyleId}),
    );

    final body = _decode(response);
    if (response.statusCode != 200) {
      throw AvatarApiException(_errorMessage(body, response.statusCode));
    }

    return _toAvatar(body);
  }

  Future<Avatar> linkThirdPartyAvatar(String url) async {
    final response = await _client.put(
      Uri.parse('$_baseUrl/profile/avatar/link'),
      headers: _headers,
      body: jsonEncode({'url': url}),
    );

    final body = _decode(response);
    if (response.statusCode != 200) {
      throw AvatarApiException(_errorMessage(body, response.statusCode));
    }

    return _toAvatar(body);
  }

  Future<Avatar> clearAvatar() async {
    final response = await _client.delete(Uri.parse('$_baseUrl/profile/avatar'), headers: _headers);

    final body = _decode(response);
    if (response.statusCode != 200) {
      throw AvatarApiException(_errorMessage(body, response.statusCode));
    }

    return _toAvatar(body);
  }

  Future<Avatar> setShowAvatarOnProfile(bool show) async {
    final response = await _client.put(
      Uri.parse('$_baseUrl/profile/avatar/visibility'),
      headers: _headers,
      body: jsonEncode({'showAvatarOnProfile': show}),
    );

    final body = _decode(response);
    if (response.statusCode != 200) {
      throw AvatarApiException(_errorMessage(body, response.statusCode));
    }

    return _toAvatar(body);
  }

  Avatar _toAvatar(Map<String, dynamic> json) {
    return Avatar(
      avatarStyleId: json['avatarStyleId'] as String?,
      thirdPartyAvatarUrl: json['thirdPartyAvatarUrl'] as String?,
      showAvatarOnProfile: json['showAvatarOnProfile'] as bool,
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
