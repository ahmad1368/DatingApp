import 'dart:convert';

import 'package:http/http.dart' as http;

class SpotifyApiException implements Exception {
  SpotifyApiException(this.message);

  final String message;

  @override
  String toString() => message;
}

class MusicCompatibility {
  MusicCompatibility({required this.percentage, required this.sharedArtists});

  final int? percentage;
  final List<String> sharedArtists;
}

/// One Spotify search result, ready to preview or send in chat - see
/// MessagingApi.sendTrackMessage.
class SpotifyTrackResult {
  SpotifyTrackResult({
    required this.trackId,
    required this.trackName,
    required this.artistName,
    this.albumArtUrl,
  });

  final String trackId;
  final String trackName;
  final String artistName;
  final String? albumArtUrl;
}

/// Talks to the backend's Spotify music-compatibility endpoint.
class SpotifyApi {
  SpotifyApi({required this.accessToken, http.Client? client, String? baseUrl})
      : _client = client ?? http.Client(),
        _baseUrl = baseUrl ?? 'http://10.0.2.2:3000';

  final String accessToken;
  final http.Client _client;
  final String _baseUrl;

  Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $accessToken',
      };

  Future<MusicCompatibility> fetchMusicCompatibility(String otherUserId) async {
    final response = await _client.get(
      Uri.parse('$_baseUrl/profile/spotify/compatibility/$otherUserId'),
      headers: _headers,
    );

    final body = _decode(response);
    if (response.statusCode != 200) {
      throw SpotifyApiException(_errorMessage(body, response.statusCode));
    }

    return MusicCompatibility(
      percentage: body['percentage'] as int?,
      sharedArtists: (body['sharedArtists'] as List).cast<String>(),
    );
  }

  /// Searches the caller's own connected Spotify account - throws
  /// [SpotifyApiException] if they haven't connected one yet.
  Future<List<SpotifyTrackResult>> searchTracks(String query) async {
    final response = await _client.get(
      Uri.parse('$_baseUrl/profile/spotify/search?q=${Uri.encodeQueryComponent(query)}'),
      headers: _headers,
    );

    if (response.statusCode != 200) {
      throw SpotifyApiException(_errorMessage(_decode(response), response.statusCode));
    }

    final list = jsonDecode(response.body) as List;
    return list.cast<Map<String, dynamic>>().map((json) {
      return SpotifyTrackResult(
        trackId: json['trackId'] as String,
        trackName: json['trackName'] as String,
        artistName: json['artistName'] as String,
        albumArtUrl: json['albumArtUrl'] as String?,
      );
    }).toList();
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
