import 'dart:convert';

import 'package:http/http.dart' as http;

class GenderIdentityApiException implements Exception {
  GenderIdentityApiException(this.message);

  final String message;

  @override
  String toString() => message;
}

class GenderIdentityCatalog {
  GenderIdentityCatalog({required this.genderIdentities, required this.orientations});

  final List<String> genderIdentities;
  final List<String> orientations;
}

class GenderIdentityResult {
  GenderIdentityResult({
    required this.genderIdentities,
    this.customGenderDescription,
    required this.showGenderOnProfile,
    required this.orientations,
    this.customOrientationDescription,
    required this.showOrientationOnProfile,
  });

  final List<String> genderIdentities;
  final String? customGenderDescription;
  final bool showGenderOnProfile;
  final List<String> orientations;
  final String? customOrientationDescription;
  final bool showOrientationOnProfile;
}

/// Talks to the backend's gender identity & orientation endpoints. The
/// catalog is public; reading/saving a user's own selections requires an
/// access token.
class GenderIdentityApi {
  GenderIdentityApi({this.accessToken, http.Client? client, String? baseUrl})
      : _client = client ?? http.Client(),
        _baseUrl = baseUrl ?? 'http://10.0.2.2:3000';

  final String? accessToken;
  final http.Client _client;
  final String _baseUrl;

  Map<String, String> get _authHeaders => {
        'Content-Type': 'application/json',
        if (accessToken != null) 'Authorization': 'Bearer $accessToken',
      };

  Future<GenderIdentityCatalog> fetchCatalog() async {
    final response = await _client.get(Uri.parse('$_baseUrl/profile/gender-identity/catalog'));

    if (response.statusCode != 200) {
      throw GenderIdentityApiException(_errorMessage(_decode(response), response.statusCode));
    }

    final body = _decode(response);
    return GenderIdentityCatalog(
      genderIdentities: (body['genderIdentities'] as List).cast<String>(),
      orientations: (body['orientations'] as List).cast<String>(),
    );
  }

  Future<GenderIdentityResult> fetchGenderIdentity() async {
    final response = await _client.get(
      Uri.parse('$_baseUrl/profile/gender-identity'),
      headers: _authHeaders,
    );

    return _parse(response);
  }

  Future<GenderIdentityResult> setGenderIdentity({
    required List<String> genderIdentities,
    String? customGenderDescription,
    required bool showGenderOnProfile,
    required List<String> orientations,
    String? customOrientationDescription,
    required bool showOrientationOnProfile,
  }) async {
    final response = await _client.put(
      Uri.parse('$_baseUrl/profile/gender-identity'),
      headers: _authHeaders,
      body: jsonEncode({
        'genderIdentities': genderIdentities,
        'customGenderDescription': ?customGenderDescription,
        'showGenderOnProfile': showGenderOnProfile,
        'orientations': orientations,
        'customOrientationDescription': ?customOrientationDescription,
        'showOrientationOnProfile': showOrientationOnProfile,
      }),
    );

    return _parse(response);
  }

  GenderIdentityResult _parse(http.Response response) {
    final body = _decode(response);
    if (response.statusCode != 200) {
      throw GenderIdentityApiException(_errorMessage(body, response.statusCode));
    }

    return GenderIdentityResult(
      genderIdentities: (body['genderIdentities'] as List).cast<String>(),
      customGenderDescription: body['customGenderDescription'] as String?,
      showGenderOnProfile: body['showGenderOnProfile'] as bool,
      orientations: (body['orientations'] as List).cast<String>(),
      customOrientationDescription: body['customOrientationDescription'] as String?,
      showOrientationOnProfile: body['showOrientationOnProfile'] as bool,
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
