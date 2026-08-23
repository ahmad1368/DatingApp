import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/safety/screen_security_api.dart';

void main() {
  group('ScreenSecurityApi.fetchStatus', () {
    test('sends the bearer token and parses an active freeze', () async {
      final api = ScreenSecurityApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.headers['Authorization'], 'Bearer a-jwt');
          expect(request.method, 'GET');
          expect(request.url.path, '/screen-security/status');
          return http.Response(
            '{"frozen":true,"frozenUntil":"2026-01-02T00:00:00.000Z","violationCount":0}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final status = await api.fetchStatus();

      expect(status.frozen, isTrue);
      expect(status.frozenUntil, DateTime.parse('2026-01-02T00:00:00.000Z'));
    });

    test('parses a status with no active freeze', () async {
      final api = ScreenSecurityApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => http.Response(
            '{"frozen":false,"frozenUntil":null,"violationCount":1}',
            200,
            headers: {'content-type': 'application/json'},
          ),
        ),
      );

      final status = await api.fetchStatus();

      expect(status.frozen, isFalse);
      expect(status.frozenUntil, isNull);
      expect(status.violationCount, 1);
    });

    test('throws ScreenSecurityApiException on failure', () async {
      final api = ScreenSecurityApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => http.Response(
            '{"message":"User not found."}',
            404,
            headers: {'content-type': 'application/json'},
          ),
        ),
      );

      expect(() => api.fetchStatus(), throwsA(isA<ScreenSecurityApiException>()));
    });
  });

  group('ScreenSecurityApi.reportViolation', () {
    test('sends the context and parses the warning', () async {
      final api = ScreenSecurityApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.method, 'POST');
          expect(request.url.path, '/screen-security/violations');
          expect(request.body, '{"context":"CHAT"}');
          return http.Response(
            '{"warning":"Screen capture detected.","frozen":false,"frozenUntil":null,"violationCount":1}',
            201,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final result = await api.reportViolation('CHAT');

      expect(result.warning, 'Screen capture detected.');
      expect(result.frozen, isFalse);
    });

    test('throws ScreenSecurityApiException on failure', () async {
      final api = ScreenSecurityApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => http.Response(
            '{"message":"User not found."}',
            404,
            headers: {'content-type': 'application/json'},
          ),
        ),
      );

      expect(() => api.reportViolation('PROFILE'), throwsA(isA<ScreenSecurityApiException>()));
    });
  });
}
