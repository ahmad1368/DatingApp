import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/verification/verification_api.dart';

void main() {
  group('VerificationApi.requestChallenge', () {
    test('sends the bearer token and parses the challenge', () async {
      final api = VerificationApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.url.path, '/verification/selfie/challenge');
          expect(request.headers['Authorization'], 'Bearer a-jwt');
          return http.Response(
            '{"challengeId":"challenge-1","gesture":"SMILE","expiresInSeconds":120}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final challenge = await api.requestChallenge();

      expect(challenge.challengeId, 'challenge-1');
      expect(challenge.gesture, 'SMILE');
      expect(challenge.expiresInSeconds, 120);
    });

    test('throws VerificationApiException on a non-200 response', () async {
      final api = VerificationApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => http.Response(
            '{"message":"Missing authentication token."}',
            401,
            headers: {'content-type': 'application/json'},
          ),
        ),
      );

      expect(() => api.requestChallenge(), throwsA(isA<VerificationApiException>()));
    });
  });

  group('VerificationApi.submitSelfie', () {
    test('sends the challenge id and selfie, and parses the result', () async {
      final api = VerificationApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.url.path, '/verification/selfie/submit');
          expect(
            request.body,
            '{"challengeId":"challenge-1","selfieImageBase64":"c2VsZmll"}',
          );
          return http.Response(
            '{"isVerified":true,"confidence":0.95}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final result = await api.submitSelfie(
        challengeId: 'challenge-1',
        selfieImageBase64: 'c2VsZmll',
      );

      expect(result.isVerified, isTrue);
      expect(result.confidence, 0.95);
    });
  });
}
