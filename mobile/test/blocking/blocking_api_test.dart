import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/blocking/blocking_api.dart';

void main() {
  group('BlockingApi.syncContacts', () {
    test('sends the contacts and parses the result', () async {
      final api = BlockingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.method, 'POST');
          expect(request.url.path, '/blocking/sync-contacts');
          expect(request.headers['Authorization'], 'Bearer a-jwt');
          expect(request.body, '{"contacts":["+15551234567","friend@example.com"]}');
          return http.Response(
            '{"totalSubmitted":2,"matchedUsers":1}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final result = await api.syncContacts(['+15551234567', 'friend@example.com']);

      expect(result.totalSubmitted, 2);
      expect(result.matchedUsers, 1);
    });

    test('throws BlockingApiException on a non-200 response', () async {
      final api = BlockingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async => http.Response('', 500)),
      );

      expect(() => api.syncContacts(['+15551234567']), throwsA(isA<BlockingApiException>()));
    });
  });

  group('BlockingApi.fetchBlockedContacts', () {
    test('parses the list of blocked contacts', () async {
      final api = BlockingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.method, 'GET');
          expect(request.url.path, '/blocking/blocked-contacts');
          return http.Response(
            '[{"id":"block-1","contactValue":"+15551234567","blockedUserId":"user-2",'
            '"blockedUserName":"Alex","blockedUserPhotoUrl":null,'
            '"createdAt":"2026-01-01T00:00:00.000Z"}]',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final contacts = await api.fetchBlockedContacts();

      expect(contacts, hasLength(1));
      expect(contacts.first.blockedUserName, 'Alex');
      expect(contacts.first.isAppUser, isTrue);
    });

    test('throws BlockingApiException on a non-200 response', () async {
      final api = BlockingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async => http.Response('', 500)),
      );

      expect(() => api.fetchBlockedContacts(), throwsA(isA<BlockingApiException>()));
    });
  });

  group('BlockingApi.unblockContact', () {
    test('sends a DELETE to the blocked contact endpoint', () async {
      http.Request? capturedRequest;
      final api = BlockingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          capturedRequest = request;
          return http.Response('', 200);
        }),
      );

      await api.unblockContact('block-1');

      expect(capturedRequest, isNotNull);
      expect(capturedRequest!.method, 'DELETE');
      expect(capturedRequest!.url.path, '/blocking/blocked-contacts/block-1');
    });

    test('throws BlockingApiException on a non-200 response', () async {
      final api = BlockingApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => http.Response(
            '{"message":"Blocked contact not found."}',
            404,
            headers: {'content-type': 'application/json'},
          ),
        ),
      );

      expect(() => api.unblockContact('block-1'), throwsA(isA<BlockingApiException>()));
    });
  });
}
