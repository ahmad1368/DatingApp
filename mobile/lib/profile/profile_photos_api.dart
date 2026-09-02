import 'dart:convert';

import 'package:http/http.dart' as http;

class ProfilePhotosApiException implements Exception {
  ProfilePhotosApiException(this.message);

  final String message;

  @override
  String toString() => message;
}

class ProfilePhoto {
  ProfilePhoto({
    required this.id,
    required this.mediaUrl,
    required this.isLead,
    required this.impressions,
    required this.rightSwipes,
    required this.conversionRate,
    required this.qualityScore,
    required this.cropFocalX,
    required this.cropFocalY,
    required this.brightnessAdjustment,
    this.caption,
  });

  final String id;
  final String mediaUrl;
  final bool isLead;
  final int impressions;
  final int rightSwipes;
  final double? conversionRate;
  final int qualityScore;

  /// Normalized (0-1) smart-crop focal point from AI facial detection. Each
  /// axis maps to a Flutter `Alignment` via `value * 2 - 1` (-1 to 1,
  /// centered at 0) so `Image` can crop/center on the detected face across
  /// any container aspect ratio via `alignment:`.
  final double cropFocalX;
  final double cropFocalY;

  /// AI-suggested exposure fix in percentage points (-30..+30), negative
  /// meaning "darken" and positive "brighten"; 0 means already well-exposed.
  /// Actually adjusting the image is left to the client.
  final int brightnessAdjustment;

  /// User-written context or humor caption shown under this photo, null
  /// until set - see ProfilePhotosApi.setPhotoCaption.
  final String? caption;
}

/// Why the curator is suggesting a photo be removed - see
/// ProfilePhotosService.getCurationSuggestions on the backend.
enum PhotoCurationReason { blurry, duplicate, lowEngagement }

class PhotoCurationSuggestion {
  PhotoCurationSuggestion({required this.photoId, required this.mediaUrl, required this.reasons});

  final String photoId;
  final String mediaUrl;
  final List<PhotoCurationReason> reasons;
}

class PhotoGalleryCuration {
  PhotoGalleryCuration({required this.suggestedRemovals, required this.suggestedOrder});

  final List<PhotoCurationSuggestion> suggestedRemovals;

  /// Photo ids in the AI-recommended best-first order.
  final List<String> suggestedOrder;
}

/// Talks to the backend's profile photo gallery endpoints. The lead photo
/// (first in the list) is what's shown in other users' discovery decks, and
/// automatically rotates server-side to whichever photo is converting best
/// once it has enough swipes - see DiscoveryService.recordSwipe.
class ProfilePhotosApi {
  ProfilePhotosApi({required this.accessToken, http.Client? client, String? baseUrl})
      : _client = client ?? http.Client(),
        _baseUrl = baseUrl ?? 'http://10.0.2.2:3000';

  final String accessToken;
  final http.Client _client;
  final String _baseUrl;

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $accessToken',
      };

  Future<List<ProfilePhoto>> fetchMyPhotos() async {
    final response = await _client.get(Uri.parse('$_baseUrl/profile-photos'), headers: _headers);

    if (response.statusCode != 200) {
      throw ProfilePhotosApiException(_errorMessage(_decode(response), response.statusCode));
    }

    final list = jsonDecode(response.body) as List;
    return list.cast<Map<String, dynamic>>().map(_toProfilePhoto).toList();
  }

  Future<ProfilePhoto> addPhoto(String mediaUrl) async {
    final response = await _client.post(
      Uri.parse('$_baseUrl/profile-photos'),
      headers: _headers,
      body: jsonEncode({'mediaUrl': mediaUrl}),
    );

    final body = _decode(response);
    if (response.statusCode != 201) {
      throw ProfilePhotosApiException(_errorMessage(body, response.statusCode));
    }

    return _toProfilePhoto(body);
  }

  Future<void> deletePhoto(String photoId) async {
    final response = await _client.delete(
      Uri.parse('$_baseUrl/profile-photos/$photoId'),
      headers: _headers,
    );

    if (response.statusCode != 200) {
      throw ProfilePhotosApiException(_errorMessage(_decode(response), response.statusCode));
    }
  }

  /// Sets, changes, or clears (pass null) the caption shown under a photo.
  Future<ProfilePhoto> setPhotoCaption(String photoId, String? caption) async {
    final response = await _client.put(
      Uri.parse('$_baseUrl/profile-photos/$photoId/caption'),
      headers: _headers,
      body: jsonEncode({if (caption != null) 'caption': caption}),
    );

    final body = _decode(response);
    if (response.statusCode != 200) {
      throw ProfilePhotosApiException(_errorMessage(body, response.statusCode));
    }

    return _toProfilePhoto(body);
  }

  /// AI-suggested reorder: re-ranks the gallery by quality score (lighting,
  /// clarity, background) instead of swipe conversion, so newly-added photos
  /// can be promoted ahead of older ones before they've collected any swipes.
  Future<List<ProfilePhoto>> reorderByQuality() async {
    final response = await _client.post(
      Uri.parse('$_baseUrl/profile-photos/reorder-by-quality'),
      headers: _headers,
    );

    if (response.statusCode != 200) {
      throw ProfilePhotosApiException(_errorMessage(_decode(response), response.statusCode));
    }

    final list = jsonDecode(response.body) as List;
    return list.cast<Map<String, dynamic>>().map(_toProfilePhoto).toList();
  }

  /// AI-curated cleanup pass over the gallery: which photos look blurry,
  /// duplicated, or under-performing and worth removing, plus a proposed
  /// best-first order for the whole gallery. Read-only - act on a
  /// suggestion via [deletePhoto] or [reorderByQuality].
  Future<PhotoGalleryCuration> fetchCurationSuggestions() async {
    final response = await _client.get(
      Uri.parse('$_baseUrl/profile-photos/curation-suggestions'),
      headers: _headers,
    );

    final body = _decode(response);
    if (response.statusCode != 200) {
      throw ProfilePhotosApiException(_errorMessage(body, response.statusCode));
    }

    final removals = (body['suggestedRemovals'] as List).cast<Map<String, dynamic>>().map((json) {
      return PhotoCurationSuggestion(
        photoId: json['photoId'] as String,
        mediaUrl: json['mediaUrl'] as String,
        reasons: (json['reasons'] as List).cast<String>().map(_toCurationReason).toList(),
      );
    }).toList();

    return PhotoGalleryCuration(
      suggestedRemovals: removals,
      suggestedOrder: (body['suggestedOrder'] as List).cast<String>(),
    );
  }

  PhotoCurationReason _toCurationReason(String reason) {
    switch (reason) {
      case 'BLURRY':
        return PhotoCurationReason.blurry;
      case 'DUPLICATE':
        return PhotoCurationReason.duplicate;
      case 'LOW_ENGAGEMENT':
        return PhotoCurationReason.lowEngagement;
      default:
        throw ProfilePhotosApiException('Unknown curation reason: $reason');
    }
  }

  /// Incognito photo blur: when enabled, this user's photos show blurred to
  /// anyone browsing the deck who hasn't matched with them yet.
  Future<bool> fetchBlurUntilMatch() async {
    final response = await _client.get(
      Uri.parse('$_baseUrl/profile-photos/blur-until-match'),
      headers: _headers,
    );

    final body = _decode(response);
    if (response.statusCode != 200) {
      throw ProfilePhotosApiException(_errorMessage(body, response.statusCode));
    }

    return body['blurPhotosUntilMatch'] as bool;
  }

  Future<bool> setBlurUntilMatch(bool enabled) async {
    final response = await _client.put(
      Uri.parse('$_baseUrl/profile-photos/blur-until-match'),
      headers: _headers,
      body: jsonEncode({'enabled': enabled}),
    );

    final body = _decode(response);
    if (response.statusCode != 200) {
      throw ProfilePhotosApiException(_errorMessage(body, response.statusCode));
    }

    return body['blurPhotosUntilMatch'] as bool;
  }

  ProfilePhoto _toProfilePhoto(Map<String, dynamic> json) {
    return ProfilePhoto(
      id: json['id'] as String,
      mediaUrl: json['mediaUrl'] as String,
      isLead: json['isLead'] as bool,
      impressions: json['impressions'] as int,
      rightSwipes: json['rightSwipes'] as int,
      conversionRate: (json['conversionRate'] as num?)?.toDouble(),
      qualityScore: json['qualityScore'] as int,
      cropFocalX: (json['cropFocalX'] as num).toDouble(),
      cropFocalY: (json['cropFocalY'] as num).toDouble(),
      brightnessAdjustment: json['brightnessAdjustment'] as int,
      caption: json['caption'] as String?,
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
