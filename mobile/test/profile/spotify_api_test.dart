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
}
