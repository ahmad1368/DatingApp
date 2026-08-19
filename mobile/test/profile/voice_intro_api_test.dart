import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/profile/voice_intro_api.dart';

void main() {
  group('VoiceIntroApi.setVoiceIntro', () {
    test('sends the bearer token and payload, and parses the result', () async {
      final api = VoiceIntroApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.method, 'PUT');
          expect(request.url.path, '/profile/voice-intro');
          expect(request.headers['Authorization'], 'Bearer a-jwt');
          expect(request.body, '{"url":"file:///tmp/intro.m4a","durationSeconds":25}');
          return http.Response(
            '{"url":"file:///tmp/intro.m4a","durationSeconds":25}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final result = await api.setVoiceIntro(url: 'file:///tmp/intro.m4a', durationSeconds: 25);

      expect(result.url, 'file:///tmp/intro.m4a');
      expect(result.durationSeconds, 25);
    });

    test('throws VoiceIntroApiException on a non-200 response', () async {
      final api = VoiceIntroApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => http.Response(
            '{"message":"durationSeconds must not be greater than 30"}',
            400,
            headers: {'content-type': 'application/json'},
          ),
        ),
      );

      expect(
        () => api.setVoiceIntro(url: 'file:///tmp/intro.m4a', durationSeconds: 60),
        throwsA(isA<VoiceIntroApiException>()),
      );
    });
  });

  group('VoiceIntroApi.clearVoiceIntro', () {
    test('sends a DELETE request and parses the cleared result', () async {
      final api = VoiceIntroApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.method, 'DELETE');
          expect(request.url.path, '/profile/voice-intro');
          return http.Response(
            '{"url":null,"durationSeconds":null}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final result = await api.clearVoiceIntro();

      expect(result.url, isNull);
    });
  });
}
