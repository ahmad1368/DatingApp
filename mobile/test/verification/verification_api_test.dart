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

  group('VerificationApi.fetchStatus', () {
    test('sends the bearer token and parses the status', () async {
      final api = VerificationApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.method, 'GET');
          expect(request.url.path, '/verification/selfie/status');
          expect(request.headers['Authorization'], 'Bearer a-jwt');
          return http.Response(
            '{"isVerified":true,"verifiedAt":"2026-01-01T00:00:00.000Z",'
            '"reverificationDue":true,"reverificationReason":"PHOTO_CHANGED"}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final status = await api.fetchStatus();

      expect(status.isVerified, isTrue);
      expect(status.verifiedAt, DateTime.parse('2026-01-01T00:00:00.000Z'));
      expect(status.reverificationDue, isTrue);
      expect(status.reverificationReason, 'PHOTO_CHANGED');
    });

    test('parses a not-due status with null verifiedAt and reason', () async {
      final api = VerificationApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => http.Response(
            '{"isVerified":false,"verifiedAt":null,'
            '"reverificationDue":false,"reverificationReason":null}',
            200,
            headers: {'content-type': 'application/json'},
          ),
        ),
      );

      final status = await api.fetchStatus();

      expect(status.isVerified, isFalse);
      expect(status.verifiedAt, isNull);
      expect(status.reverificationDue, isFalse);
      expect(status.reverificationReason, isNull);
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

      expect(() => api.fetchStatus(), throwsA(isA<VerificationApiException>()));
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
