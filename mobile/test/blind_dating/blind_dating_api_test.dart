import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/blind_dating/blind_dating_api.dart';

http.Response _jsonResponse(String body, int status) =>
    http.Response(body, status, headers: {'content-type': 'application/json'});

const _noneStatusResponse = '{"status":"NONE","sessionId":null,"expiresAt":null,'
    '"isRevealed":false,"myRevealRequested":false,"otherRevealRequested":false,'
    '"otherProfile":null}';

void main() {
  group('BlindDatingApi.fetchStatus', () {
    test('sends the bearer token and parses NONE status', () async {
      final api = BlindDatingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.url.path, '/blind-dating/status');
          expect(request.headers['Authorization'], 'Bearer a-jwt');
          return _jsonResponse(_noneStatusResponse, 200);
        }),
      );

      final status = await api.fetchStatus();

      expect(status.status, 'NONE');
      expect(status.sessionId, isNull);
    });

    test('parses a revealed status with the other profile', () async {
      final api = BlindDatingApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => _jsonResponse(
            '{"status":"ACTIVE","sessionId":"session-1","expiresAt":"2026-01-01T00:10:00.000Z",'
            '"isRevealed":true,"myRevealRequested":true,"otherRevealRequested":true,'
            '"otherProfile":{"id":"user-2","name":"Alex","profilePhotoUrl":"alex.jpg"}}',
            200,
          ),
        ),
      );

      final status = await api.fetchStatus();

      expect(status.isActive, isTrue);
      expect(status.isRevealed, isTrue);
      expect(status.otherProfile!.name, 'Alex');
    });

    test('throws BlindDatingApiException on a non-200 response', () async {
      final api = BlindDatingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async => http.Response('', 500)),
      );

      expect(() => api.fetchStatus(), throwsA(isA<BlindDatingApiException>()));
    });
  });

  group('BlindDatingApi.joinQueue', () {
    test('sends a POST and parses WAITING status', () async {
      final api = BlindDatingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.method, 'POST');
          expect(request.url.path, '/blind-dating/queue/join');
          return _jsonResponse(
            '{"status":"WAITING","sessionId":null,"expiresAt":null,"isRevealed":false,'
            '"myRevealRequested":false,"otherRevealRequested":false,"otherProfile":null}',
            200,
          );
        }),
      );

      final status = await api.joinQueue();

      expect(status.isWaiting, isTrue);
    });

    test('throws BlindDatingApiException when already in an active session', () async {
      final api = BlindDatingApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => _jsonResponse(
            '{"message":"You already have an active blind date session."}',
            400,
          ),
        ),
      );

      expect(() => api.joinQueue(), throwsA(isA<BlindDatingApiException>()));
    });
  });

  group('BlindDatingApi.leaveQueue', () {
    test('sends a POST to leave the queue', () async {
      http.Request? capturedRequest;
      final api = BlindDatingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          capturedRequest = request;
          return http.Response('', 200);
        }),
      );

      await api.leaveQueue();

      expect(capturedRequest, isNotNull);
      expect(capturedRequest!.url.path, '/blind-dating/queue/leave');
    });
  });

  group('BlindDatingApi.fetchMessages', () {
    test('parses a list of messages', () async {
      final api = BlindDatingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.url.path, '/blind-dating/sessions/session-1/messages');
          return _jsonResponse(
            '[{"id":"m1","senderId":"user-1","content":"hi","createdAt":"2026-01-01T00:00:00.000Z"}]',
            200,
          );
        }),
      );

      final messages = await api.fetchMessages('session-1');

      expect(messages, hasLength(1));
      expect(messages.first.content, 'hi');
    });
  });

  group('BlindDatingApi.sendMessage', () {
    test('sends the content and parses the created message', () async {
      final api = BlindDatingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.method, 'POST');
          expect(request.url.path, '/blind-dating/sessions/session-1/messages');
          expect(request.body, '{"content":"hey there"}');
          return _jsonResponse(
            '{"id":"m2","senderId":"user-1","content":"hey there","createdAt":"2026-01-01T00:01:00.000Z"}',
            201,
          );
        }),
      );

      final message = await api.sendMessage(sessionId: 'session-1', content: 'hey there');

      expect(message.content, 'hey there');
    });

    test('throws BlindDatingApiException after the session has ended', () async {
      final api = BlindDatingApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async =>
              _jsonResponse('{"message":"This blind date session has ended."}', 400),
        ),
      );

      expect(
        () => api.sendMessage(sessionId: 'session-1', content: 'hi'),
        throwsA(isA<BlindDatingApiException>()),
      );
    });
  });

  group('BlindDatingApi.requestReveal', () {
    test('sends a POST and parses the updated status', () async {
      final api = BlindDatingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.method, 'POST');
          expect(request.url.path, '/blind-dating/sessions/session-1/reveal');
          return _jsonResponse(
            '{"status":"ACTIVE","sessionId":"session-1","expiresAt":"2026-01-01T00:10:00.000Z",'
            '"isRevealed":false,"myRevealRequested":true,"otherRevealRequested":false,'
            '"otherProfile":null}',
            200,
          );
        }),
      );

      final status = await api.requestReveal('session-1');

      expect(status.myRevealRequested, isTrue);
      expect(status.isRevealed, isFalse);
    });
  });
}
