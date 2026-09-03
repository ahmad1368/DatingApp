import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/profile/spotify_api.dart';

http.Response _jsonResponse(String body, int status) =>
    http.Response(body, status, headers: {'content-type': 'application/json'});

void main() {
  group('SpotifyApi.fetchMusicCompatibility', () {
    test('sends the bearer token and parses a percentage with shared artists', () async {
      final api = SpotifyApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.headers['Authorization'], 'Bearer a-jwt');
          expect(request.url.path, '/profile/spotify/compatibility/user-2');
          return _jsonResponse('{"percentage":50,"sharedArtists":["Artist Two","Artist Three"]}', 200);
        }),
      );

      final result = await api.fetchMusicCompatibility('user-2');

      expect(result.percentage, 50);
      expect(result.sharedArtists, ['Artist Two', 'Artist Three']);
    });

    test('parses a null percentage when neither side has synced Spotify', () async {
      final api = SpotifyApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => _jsonResponse('{"percentage":null,"sharedArtists":[]}', 200),
        ),
      );

      final result = await api.fetchMusicCompatibility('user-2');

      expect(result.percentage, isNull);
      expect(result.sharedArtists, isEmpty);
    });

    test('throws SpotifyApiException on a non-200 response', () async {
      final api = SpotifyApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => _jsonResponse('{"message":"User not found."}', 404),
        ),
      );

      expect(
        () => api.fetchMusicCompatibility('user-2'),
        throwsA(isA<SpotifyApiException>()),
      );
    });
  });

  group('SpotifyApi.searchTracks', () {
    test('sends the query and parses the results', () async {
      final api = SpotifyApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.url.path, '/profile/spotify/search');
          expect(request.url.queryParameters['q'], 'a song');
          return _jsonResponse(
            '[{"trackId":"track-1","trackName":"Song One","artistName":"Artist One",'
            '"albumArtUrl":"https://example.com/1.jpg"},'
            '{"trackId":"track-2","trackName":"Song Two","artistName":"Artist Two",'
            '"albumArtUrl":null}]',
            200,
          );
        }),
      );

      final results = await api.searchTracks('a song');

      expect(results, hasLength(2));
      expect(results.first.trackName, 'Song One');
      expect(results.first.albumArtUrl, 'https://example.com/1.jpg');
      expect(results.last.albumArtUrl, isNull);
    });

    test('throws SpotifyApiException when Spotify is not connected', () async {
      final api = SpotifyApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => _jsonResponse('{"message":"Spotify is not connected."}', 400),
        ),
      );

      expect(() => api.searchTracks('a song'), throwsA(isA<SpotifyApiException>()));
    });
  });
}
