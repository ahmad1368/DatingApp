import 'dart:convert';

import 'package:http/http.dart' as http;

class LocationApiException implements Exception {
  LocationApiException(this.message);

  final String message;

  @override
  String toString() => message;
}

class RadiusSettings {
  RadiusSettings({
    required this.searchRadiusKm,
    required this.autoExpandRadiusEnabled,
    required this.distanceUnit,
  });

  final int searchRadiusKm;
  final bool autoExpandRadiusEnabled;
  final String distanceUnit;
}

class NearbyUser {
  NearbyUser({required this.id, this.name, required this.distanceKm});

  final String id;
  final String? name;
  final double distanceKm;
}

class CrossedPath {
  CrossedPath({
    required this.id,
    this.name,
    this.profilePhotoUrl,
    required this.crossCount,
    required this.closestDistanceKm,
    required this.lastCrossedAt,
  });

  final String id;
  final String? name;
  final String? profilePhotoUrl;
  final int crossCount;
  final double closestDistanceKm;
  final DateTime lastCrossedAt;
}

class CrossingZone {
  CrossingZone({
    required this.zoneId,
    required this.latitude,
    required this.longitude,
    required this.crossingCount,
    required this.uniqueUserCount,
    required this.lastCrossedAt,
  });

  final String zoneId;
  final double latitude;
  final double longitude;
  final int crossingCount;
  final int uniqueUserCount;
  final DateTime lastCrossedAt;
}

/// Talks to the backend's GPS location and search-radius endpoints. Requires
/// a signed-in user's access token.
class LocationApi {
  LocationApi({required this.accessToken, http.Client? client, String? baseUrl})
      : _client = client ?? http.Client(),
        _baseUrl = baseUrl ?? 'http://10.0.2.2:3000';

  final String accessToken;
  final http.Client _client;
  final String _baseUrl;

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $accessToken',
      };

  Future<void> updateLocation({required double latitude, required double longitude}) async {
    final response = await _client.put(
      Uri.parse('$_baseUrl/location'),
      headers: _headers,
      body: jsonEncode({'latitude': latitude, 'longitude': longitude}),
    );

    final body = _decode(response);
    if (response.statusCode != 200) {
      throw LocationApiException(_errorMessage(body, response.statusCode));
    }
  }

  Future<int> updateSearchRadius(int radiusKm) async {
    final response = await _client.put(
      Uri.parse('$_baseUrl/location/radius'),
      headers: _headers,
      body: jsonEncode({'radiusKm': radiusKm}),
    );

    final body = _decode(response);
    if (response.statusCode != 200) {
      throw LocationApiException(_errorMessage(body, response.statusCode));
    }

    return body['searchRadiusKm'] as int;
  }

  Future<RadiusSettings> fetchRadiusSettings() async {
    final response = await _client.get(Uri.parse('$_baseUrl/location/radius'), headers: _headers);

    final body = _decode(response);
    if (response.statusCode != 200) {
      throw LocationApiException(_errorMessage(body, response.statusCode));
    }

    return RadiusSettings(
      searchRadiusKm: body['searchRadiusKm'] as int,
      autoExpandRadiusEnabled: body['autoExpandRadiusEnabled'] as bool,
      distanceUnit: body['distanceUnit'] as String,
    );
  }

  /// When enabled (the default), the discovery deck widens the search
  /// radius for a single fetch if too few candidates are nearby, instead of
  /// showing a near-empty deck.
  Future<RadiusSettings> setAutoExpandRadius(bool enabled) async {
    final response = await _client.put(
      Uri.parse('$_baseUrl/location/radius/auto-expand'),
      headers: _headers,
      body: jsonEncode({'enabled': enabled}),
    );

    final body = _decode(response);
    if (response.statusCode != 200) {
      throw LocationApiException(_errorMessage(body, response.statusCode));
    }

    return RadiusSettings(
      searchRadiusKm: body['searchRadiusKm'] as int,
      autoExpandRadiusEnabled: body['autoExpandRadiusEnabled'] as bool,
      distanceUnit: body['distanceUnit'] as String,
    );
  }

  /// Only changes how the radius is displayed/entered client-side - the
  /// stored radius always stays in km.
  Future<RadiusSettings> setDistanceUnit(String unit) async {
    final response = await _client.put(
      Uri.parse('$_baseUrl/location/radius/unit'),
      headers: _headers,
      body: jsonEncode({'unit': unit}),
    );

    final body = _decode(response);
    if (response.statusCode != 200) {
      throw LocationApiException(_errorMessage(body, response.statusCode));
    }

    return RadiusSettings(
      searchRadiusKm: body['searchRadiusKm'] as int,
      autoExpandRadiusEnabled: body['autoExpandRadiusEnabled'] as bool,
      distanceUnit: body['distanceUnit'] as String,
    );
  }

  Future<List<NearbyUser>> fetchNearbyUsers() async {
    final response = await _client.get(
      Uri.parse('$_baseUrl/location/nearby'),
      headers: _headers,
    );

    if (response.statusCode != 200) {
      final body = _decode(response);
      throw LocationApiException(_errorMessage(body, response.statusCode));
    }

    final list = jsonDecode(response.body) as List;
    return list
        .cast<Map<String, dynamic>>()
        .map(
          (json) => NearbyUser(
            id: json['id'] as String,
            name: json['name'] as String?,
            distanceKm: (json['distanceKm'] as num).toDouble(),
          ),
        )
        .toList();
  }

  /// Everyone the current user has been physically close to recently (see
  /// backend's crossing detection), most recently crossed first.
  Future<List<CrossedPath>> fetchCrossedPaths() async {
    final response = await _client.get(
      Uri.parse('$_baseUrl/location/crossed-paths'),
      headers: _headers,
    );

    if (response.statusCode != 200) {
      final body = _decode(response);
      throw LocationApiException(_errorMessage(body, response.statusCode));
    }

    final list = jsonDecode(response.body) as List;
    return list
        .cast<Map<String, dynamic>>()
        .map(
          (json) => CrossedPath(
            id: json['id'] as String,
            name: json['name'] as String?,
            profilePhotoUrl: json['profilePhotoUrl'] as String?,
            crossCount: json['crossCount'] as int,
            closestDistanceKm: (json['closestDistanceKm'] as num).toDouble(),
            lastCrossedAt: DateTime.parse(json['lastCrossedAt'] as String),
          ),
        )
        .toList();
  }

  /// Today's crossing history grouped into approximate map zones (see
  /// backend's roundToZone) instead of by person - powers the crossing
  /// paths map overlay.
  Future<List<CrossingZone>> fetchCrossingZones() async {
    final response = await _client.get(
      Uri.parse('$_baseUrl/location/crossing-zones'),
      headers: _headers,
    );

    if (response.statusCode != 200) {
      final body = _decode(response);
      throw LocationApiException(_errorMessage(body, response.statusCode));
    }

    final list = jsonDecode(response.body) as List;
    return list
        .cast<Map<String, dynamic>>()
        .map(
          (json) => CrossingZone(
            zoneId: json['zoneId'] as String,
            latitude: (json['latitude'] as num).toDouble(),
            longitude: (json['longitude'] as num).toDouble(),
            crossingCount: json['crossingCount'] as int,
            uniqueUserCount: json['uniqueUserCount'] as int,
            lastCrossedAt: DateTime.parse(json['lastCrossedAt'] as String),
          ),
        )
        .toList();
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
