import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/vetting/vetting_api.dart';

http.Response _jsonResponse(String body, int status) =>
    http.Response(body, status, headers: {'content-type': 'application/json'});

const _applicationJson = '{"id":"app-1","userId":"user-1","status":"PENDING","referralCount":1,'
    '"socialLinks":["https://instagram.com/user1"],"decisionReason":null,'
    '"createdAt":"2026-01-01T00:00:00.000Z","decidedAt":null}';

void main() {
  group('VettingApi.apply', () {
    test('sends the social links and parses the created application', () async {
      http.Request? postRequest;
      final api = VettingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          postRequest = request;
          return _jsonResponse(_applicationJson, 201);
        }),
      );

      final application = await api.apply(['https://instagram.com/user1']);

      expect(postRequest!.url.path, '/vetting/apply');
      expect(postRequest!.body, '{"socialLinks":["https://instagram.com/user1"]}');
      expect(application.id, 'app-1');
      expect(application.isPending, isTrue);
    });

    test('throws VettingApiException when already applied', () async {
      final api = VettingApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => _jsonResponse('{"message":"You have already applied."}', 400),
        ),
      );

      expect(() => api.apply([]), throwsA(isA<VettingApiException>()));
    });
  });

  group('VettingApi.fetchMyApplication', () {
    test('parses the current application', () async {
      final api = VettingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.url.path, '/vetting/me');
          return _jsonResponse(_applicationJson, 200);
        }),
      );

      final application = await api.fetchMyApplication();

      expect(application!.referralCount, 1);
      expect(application.socialLinks, ['https://instagram.com/user1']);
    });

    test('returns null when nothing has been applied yet', () async {
      final api = VettingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async => http.Response('', 404)),
      );

      final application = await api.fetchMyApplication();

      expect(application, isNull);
    });
  });

  group('VettingApi.refer', () {
    test('sends the applicant id and parses the updated application', () async {
      http.Request? postRequest;
      final api = VettingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          postRequest = request;
          return _jsonResponse(_applicationJson, 200);
        }),
      );

      await api.refer('applicant-1');

      expect(postRequest!.url.path, '/vetting/referrals');
      expect(postRequest!.body, '{"applicantUserId":"applicant-1"}');
    });

    test('throws VettingApiException when the referrer is not approved', () async {
      final api = VettingApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async =>
              _jsonResponse('{"message":"Only approved members can refer new applicants."}', 403),
        ),
      );

      expect(() => api.refer('applicant-1'), throwsA(isA<VettingApiException>()));
    });
  });

  group('VettingApi.redeemReferralCode', () {
    test('sends the code and parses the updated application', () async {
      http.Request? postRequest;
      final api = VettingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          postRequest = request;
          return _jsonResponse(_applicationJson, 200);
        }),
      );

      await api.redeemReferralCode('ABCD1234');

      expect(postRequest!.url.path, '/vetting/referral-code/redeem');
      expect(postRequest!.body, '{"code":"ABCD1234"}');
    });
  });

  group('VettingApi.fetchMyReferralCode', () {
    test('parses the referral code', () async {
      final api = VettingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.url.path, '/vetting/referral-code');
          return _jsonResponse('{"referralCode":"ABCD1234"}', 200);
        }),
      );

      final code = await api.fetchMyReferralCode();

      expect(code, 'ABCD1234');
    });

    test('throws VettingApiException when not an approved member', () async {
      final api = VettingApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async =>
              _jsonResponse('{"message":"Only approved members can generate a referral code."}', 403),
        ),
      );

      expect(() => api.fetchMyReferralCode(), throwsA(isA<VettingApiException>()));
    });
  });

  group('VettingApi.fetchQueue', () {
    test('parses the pending applications queue', () async {
      final api = VettingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.url.path, '/vetting/queue');
          return _jsonResponse(
            '[{"id":"app-1","referralCount":2,"socialLinks":[],"createdAt":"2026-01-01T00:00:00.000Z"}]',
            200,
          );
        }),
      );

      final queue = await api.fetchQueue();

      expect(queue, hasLength(1));
      expect(queue.first.referralCount, 2);
    });

    test('throws VettingApiException when the caller is not on the committee', () async {
      final api = VettingApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async =>
              _jsonResponse('{"message":"Only committee members can perform this action."}', 403),
        ),
      );

      expect(() => api.fetchQueue(), throwsA(isA<VettingApiException>()));
    });
  });

  group('VettingApi.decide', () {
    test('sends the decision and reason, parsing the updated application', () async {
      http.Request? postRequest;
      final api = VettingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          postRequest = request;
          return _jsonResponse(
            '{"id":"app-1","userId":"user-1","status":"APPROVED","referralCount":2,'
            '"socialLinks":[],"decisionReason":null,"createdAt":"2026-01-01T00:00:00.000Z",'
            '"decidedAt":"2026-01-02T00:00:00.000Z"}',
            200,
          );
        }),
      );

      final application = await api.decide(applicationId: 'app-1', decision: 'APPROVED');

      expect(postRequest!.url.path, '/vetting/applications/app-1/decide');
      expect(postRequest!.body, '{"decision":"APPROVED"}');
      expect(application.isApproved, isTrue);
    });

    test('includes the reason when provided', () async {
      http.Request? postRequest;
      final api = VettingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          postRequest = request;
          return _jsonResponse(_applicationJson, 200);
        }),
      );

      await api.decide(applicationId: 'app-1', decision: 'REJECTED', reason: 'Not a fit');

      expect(postRequest!.body, '{"decision":"REJECTED","reason":"Not a fit"}');
    });
  });
}
