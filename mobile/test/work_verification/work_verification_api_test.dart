import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/work_verification/work_verification_api.dart';

http.Response _jsonResponse(String body, int status) =>
    http.Response(body, status, headers: {'content-type': 'application/json'});

void main() {
  group('WorkVerificationApi.fetchStatus', () {
    test('sends the bearer token and parses the status', () async {
      final api = WorkVerificationApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.method, 'GET');
          expect(request.url.path, '/work-verification/status');
          expect(request.headers['Authorization'], 'Bearer a-jwt');
          return _jsonResponse(
            '{"jobTitle":"Engineer","company":"Example Corp","school":null,'
            '"isWorkVerified":true,"isEducationVerified":false}',
            200,
          );
        }),
      );

      final status = await api.fetchStatus();

      expect(status.jobTitle, 'Engineer');
      expect(status.company, 'Example Corp');
      expect(status.school, isNull);
      expect(status.isWorkVerified, isTrue);
      expect(status.isEducationVerified, isFalse);
    });

    test('throws WorkVerificationApiException on a non-200 response', () async {
      final api = WorkVerificationApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async => _jsonResponse('', 500)),
      );

      expect(() => api.fetchStatus(), throwsA(isA<WorkVerificationApiException>()));
    });
  });

  group('WorkVerificationApi.requestVerification', () {
    test('sends the claimed job title/company and parses the result', () async {
      final api = WorkVerificationApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.method, 'POST');
          expect(request.url.path, '/work-verification/request');
          expect(
            request.body,
            '{"type":"WORK","email":"ahmad@example-corp.com","jobTitle":"Engineer","company":"Example Corp"}',
          );
          return _jsonResponse('{"expiresInSeconds":600,"resendCooldownSeconds":60}', 200);
        }),
      );

      final result = await api.requestVerification(
        type: 'WORK',
        email: 'ahmad@example-corp.com',
        jobTitle: 'Engineer',
        company: 'Example Corp',
      );

      expect(result.expiresInSeconds, 600);
      expect(result.resendCooldownSeconds, 60);
    });

    test('sends the claimed school for an EDUCATION request', () async {
      final api = WorkVerificationApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(
            request.body,
            '{"type":"EDUCATION","email":"ahmad@mit.edu","school":"MIT"}',
          );
          return _jsonResponse('{"expiresInSeconds":600,"resendCooldownSeconds":60}', 200);
        }),
      );

      await api.requestVerification(type: 'EDUCATION', email: 'ahmad@mit.edu', school: 'MIT');
    });

    test('throws WorkVerificationApiException on a non-200 response', () async {
      final api = WorkVerificationApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => _jsonResponse(
            '{"message":"A verification code was already sent recently."}',
            429,
          ),
        ),
      );

      expect(
        () => api.requestVerification(type: 'WORK', email: 'ahmad@example-corp.com'),
        throwsA(isA<WorkVerificationApiException>()),
      );
    });
  });

  group('WorkVerificationApi.confirmVerification', () {
    test('sends the code and parses the updated status', () async {
      final api = WorkVerificationApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.method, 'POST');
          expect(request.url.path, '/work-verification/confirm');
          expect(request.body, '{"code":"123456"}');
          return _jsonResponse(
            '{"jobTitle":"Engineer","company":"Example Corp","school":null,'
            '"isWorkVerified":true,"isEducationVerified":false}',
            200,
          );
        }),
      );

      final status = await api.confirmVerification('123456');

      expect(status.isWorkVerified, isTrue);
    });

    test('throws WorkVerificationApiException on an invalid code', () async {
      final api = WorkVerificationApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => _jsonResponse('{"message":"Invalid verification code."}', 401),
        ),
      );

      expect(() => api.confirmVerification('000000'), throwsA(isA<WorkVerificationApiException>()));
    });
  });
}
