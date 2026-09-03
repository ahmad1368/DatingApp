import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/profile/profile_share_api.dart';

void main() {
  group('ProfileShareApi.getOrCreateShareLink', () {
    test('sends the bearer token and returns the full share link', () async {
      final api = ProfileShareApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.method, 'POST');
          expect(request.headers['Authorization'], 'Bearer a-jwt');
          expect(request.url.path, '/profile/share-link');
          return http.Response(
            '{"shareToken":"abc123"}',
            201,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final link = await api.getOrCreateShareLink();

      expect(link, endsWith('/profile/shared/abc123'));
    });

    test('throws ProfileShareApiException on a non-201 response', () async {
      final api = ProfileShareApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => http.Response('{"message":"User not found."}', 404),
        ),
      );

      expect(() => api.getOrCreateShareLink(), throwsA(isA<ProfileShareApiException>()));
    });
  });
}
