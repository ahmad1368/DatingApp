import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/messaging/messaging_api.dart';

void main() {
  group('MessagingApi.fetchMatchStatus', () {
    test('sends the bearer token and parses the status', () async {
      final api = MessagingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.url.path, '/matches/match-1');
          expect(request.headers['Authorization'], 'Bearer a-jwt');
          return http.Response(
            '{"matchId":"match-1","expiresAt":"2026-01-02T00:00:00.000Z",'
            '"isExpired":false,"firstMessageSent":false,"canSendFirstMessage":true}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final status = await api.fetchMatchStatus('match-1');

      expect(status.matchId, 'match-1');
      expect(status.expiresAt, DateTime.parse('2026-01-02T00:00:00.000Z'));
      expect(status.isExpired, isFalse);
      expect(status.canSendFirstMessage, isTrue);
    });

    test('throws MessagingApiException on a non-200 response', () async {
      final api = MessagingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async => http.Response('{"message":"Match not found."}', 404)),
      );

      expect(() => api.fetchMatchStatus('missing'), throwsA(isA<MessagingApiException>()));
    });
  });

  group('MessagingApi.fetchMessages', () {
    test('parses a list of messages', () async {
      final api = MessagingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.url.path, '/matches/match-1/messages');
          return http.Response(
            '[{"id":"m1","senderId":"user-1","content":"hi","createdAt":"2026-01-01T00:00:00.000Z"}]',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final messages = await api.fetchMessages('match-1');

      expect(messages, hasLength(1));
      expect(messages.first.content, 'hi');
      expect(messages.first.senderId, 'user-1');
    });
  });

  group('MessagingApi.sendMessage', () {
    test('sends the content and parses the created message', () async {
      final api = MessagingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.method, 'POST');
          expect(request.url.path, '/matches/match-1/messages');
          expect(request.body, '{"content":"hey there"}');
          return http.Response(
            '{"id":"m2","senderId":"user-1","content":"hey there","createdAt":"2026-01-01T01:00:00.000Z"}',
            201,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final message = await api.sendMessage(matchId: 'match-1', content: 'hey there');

      expect(message.id, 'm2');
      expect(message.content, 'hey there');
    });

    test('throws MessagingApiException when the backend rejects the request', () async {
      final api = MessagingApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => http.Response(
            '{"message":"Only she can send the first message for this match."}',
            403,
            headers: {'content-type': 'application/json'},
          ),
        ),
      );

      expect(
        () => api.sendMessage(matchId: 'match-1', content: 'hi'),
        throwsA(isA<MessagingApiException>()),
      );
    });
  });
}
