import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/messaging/messaging_api.dart';

void main() {
  group('MessagingApi.fetchMyMatches', () {
    test('sends the bearer token and parses the match summaries', () async {
      final api = MessagingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.url.path, '/matches');
          expect(request.headers['Authorization'], 'Bearer a-jwt');
          return http.Response(
            '[{"matchId":"match-1","otherUserId":"user-2","otherUserName":"Jane",'
            '"otherUserPhotoUrl":null,"expiresAt":"2026-01-02T00:00:00.000Z",'
            '"firstMessageSent":false,"createdAt":"2026-01-01T00:00:00.000Z"}]',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final matches = await api.fetchMyMatches();

      expect(matches, hasLength(1));
      expect(matches.first.matchId, 'match-1');
      expect(matches.first.otherUserName, 'Jane');
      expect(matches.first.expiresAt, DateTime.parse('2026-01-02T00:00:00.000Z'));
      expect(matches.first.firstMessageSent, isFalse);
    });

    test('throws MessagingApiException on a non-200 response', () async {
      final api = MessagingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async => http.Response('', 500)),
      );

      expect(() => api.fetchMyMatches(), throwsA(isA<MessagingApiException>()));
    });
  });

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
            '[{"id":"m1","senderId":"user-1","contentType":"TEXT","content":"hi",'
            '"mediaUrl":null,"isBlurred":false,"createdAt":"2026-01-01T00:00:00.000Z"}]',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final messages = await api.fetchMessages('match-1');

      expect(messages, hasLength(1));
      expect(messages.first.content, 'hi');
      expect(messages.first.senderId, 'user-1');
      expect(messages.first.contentType, 'TEXT');
      expect(messages.first.isRead, isFalse);
    });

    test('parses readAt when the backend includes it', () async {
      final api = MessagingApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => http.Response(
            '[{"id":"m1","senderId":"user-1","contentType":"TEXT","content":"hi",'
            '"mediaUrl":null,"isBlurred":false,"readAt":"2026-01-01T00:05:00.000Z",'
            '"createdAt":"2026-01-01T00:00:00.000Z"}]',
            200,
            headers: {'content-type': 'application/json'},
          ),
        ),
      );

      final messages = await api.fetchMessages('match-1');

      expect(messages.first.isRead, isTrue);
      expect(messages.first.readAt, DateTime.parse('2026-01-01T00:05:00.000Z'));
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
            '{"id":"m2","senderId":"user-1","contentType":"TEXT","content":"hey there",'
            '"mediaUrl":null,"isBlurred":false,"createdAt":"2026-01-01T01:00:00.000Z"}',
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

  group('MessagingApi.sendMediaMessage', () {
    test('sends the content type and media URL, parsing a blurred image', () async {
      final api = MessagingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.method, 'POST');
          expect(request.url.path, '/matches/match-1/media');
          expect(
            request.body,
            '{"contentType":"IMAGE","mediaUrl":"https://example.com/photo.jpg"}',
          );
          return http.Response(
            '{"id":"m3","senderId":"user-1","contentType":"IMAGE","content":null,'
            '"mediaUrl":"https://example.com/photo.jpg","isBlurred":true,'
            '"createdAt":"2026-01-01T00:00:00.000Z"}',
            201,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final message = await api.sendMediaMessage(
        matchId: 'match-1',
        contentType: 'IMAGE',
        mediaUrl: 'https://example.com/photo.jpg',
      );

      expect(message.contentType, 'IMAGE');
      expect(message.isBlurred, isTrue);
      expect(message.mediaUrl, 'https://example.com/photo.jpg');
    });
  });

  group('MessagingApi.revealImage', () {
    test('sends a POST to the reveal endpoint and parses the unblurred message', () async {
      final api = MessagingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.method, 'POST');
          expect(request.url.path, '/matches/match-1/messages/m3/reveal');
          return http.Response(
            '{"id":"m3","senderId":"user-1","contentType":"IMAGE","content":null,'
            '"mediaUrl":"https://example.com/photo.jpg","isBlurred":false,'
            '"createdAt":"2026-01-01T00:00:00.000Z"}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final message = await api.revealImage(matchId: 'match-1', messageId: 'm3');

      expect(message.isBlurred, isFalse);
    });
  });

  group('MessagingApi.searchGifs', () {
    test('sends the query and parses GIF results', () async {
      final api = MessagingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.url.path, '/matches/gifs/search');
          expect(request.url.queryParameters['q'], 'cats');
          return http.Response(
            '[{"id":"g1","url":"https://example.com/g1.gif","previewUrl":"https://example.com/g1-preview.gif"}]',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final results = await api.searchGifs('cats');

      expect(results, hasLength(1));
      expect(results.first.id, 'g1');
      expect(results.first.url, 'https://example.com/g1.gif');
    });

    test('throws MessagingApiException on a non-200 response', () async {
      final api = MessagingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async => http.Response('', 500)),
      );

      expect(() => api.searchGifs('cats'), throwsA(isA<MessagingApiException>()));
    });
  });

  group('MessagingApi.checkMessage', () {
    test('sends the draft text and parses the moderation result', () async {
      final api = MessagingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.method, 'POST');
          expect(request.url.path, '/matches/moderation/check');
          expect(request.body, '{"text":"you are the worst"}');
          return http.Response(
            '{"flagged":true,"categories":["harassment"]}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final result = await api.checkMessage('you are the worst');

      expect(result.flagged, isTrue);
      expect(result.categories, ['harassment']);
    });

    test('throws MessagingApiException on a non-200 response', () async {
      final api = MessagingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async => http.Response('', 500)),
      );

      expect(() => api.checkMessage('hi'), throwsA(isA<MessagingApiException>()));
    });
  });

  group('MessagingApi.setReadReceiptsEnabled', () {
    test('sends a PUT with the enabled flag and parses the result', () async {
      final api = MessagingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.method, 'PUT');
          expect(request.url.path, '/matches/read-receipts');
          expect(request.body, '{"enabled":false}');
          return http.Response(
            '{"readReceiptsEnabled":false}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final result = await api.setReadReceiptsEnabled(false);

      expect(result, isFalse);
    });

    test('throws MessagingApiException on a non-200 response', () async {
      final api = MessagingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async => http.Response('', 500)),
      );

      expect(() => api.setReadReceiptsEnabled(true), throwsA(isA<MessagingApiException>()));
    });
  });

  group('MessagingApi.reportMessage', () {
    test('sends the reason to the report endpoint', () async {
      http.Request? capturedRequest;
      final api = MessagingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          capturedRequest = request;
          return http.Response('{}', 201, headers: {'content-type': 'application/json'});
        }),
      );

      await api.reportMessage(matchId: 'match-1', messageId: 'm1', reason: 'harassing me');

      expect(capturedRequest, isNotNull);
      expect(capturedRequest!.method, 'POST');
      expect(capturedRequest!.url.path, '/matches/match-1/messages/m1/report');
      expect(capturedRequest!.body, '{"reason":"harassing me"}');
    });

    test('throws MessagingApiException on a non-201 response', () async {
      final api = MessagingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async => http.Response('', 404)),
      );

      expect(
        () => api.reportMessage(matchId: 'match-1', messageId: 'm1', reason: 'harassing me'),
        throwsA(isA<MessagingApiException>()),
      );
    });
  });

  group('MessagingApi.fetchIcebreakerPrompts', () {
    test('parses the list of prompts', () async {
      final api = MessagingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.url.path, '/matches/icebreaker-prompts');
          return http.Response(
            '[{"id":"coffee-or-tea","question":"Coffee or tea?","optionA":"Coffee","optionB":"Tea"}]',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final prompts = await api.fetchIcebreakerPrompts();

      expect(prompts, hasLength(1));
      expect(prompts.first.id, 'coffee-or-tea');
      expect(prompts.first.optionA, 'Coffee');
    });

    test('throws MessagingApiException on a non-200 response', () async {
      final api = MessagingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async => http.Response('', 500)),
      );

      expect(() => api.fetchIcebreakerPrompts(), throwsA(isA<MessagingApiException>()));
    });
  });

  group('MessagingApi.sendIcebreaker', () {
    test('sends the prompt id and parses the created message', () async {
      final api = MessagingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.method, 'POST');
          expect(request.url.path, '/matches/match-1/icebreaker');
          expect(request.body, '{"promptId":"coffee-or-tea"}');
          return http.Response(
            '{"id":"m1","senderId":"user-1","contentType":"ICEBREAKER","content":"coffee-or-tea",'
            '"mediaUrl":null,"isBlurred":false,"icebreaker":{"promptId":"coffee-or-tea",'
            '"question":"Coffee or tea?","optionA":"Coffee","optionB":"Tea","myOptionIndex":null,'
            '"otherOptionIndex":null},"createdAt":"2026-01-01T00:00:00.000Z"}',
            201,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final message = await api.sendIcebreaker(matchId: 'match-1', promptId: 'coffee-or-tea');

      expect(message.contentType, 'ICEBREAKER');
      expect(message.icebreaker, isNotNull);
      expect(message.icebreaker!.question, 'Coffee or tea?');
      expect(message.icebreaker!.haveIAnswered, isFalse);
    });

    test('throws MessagingApiException when the prompt is unknown', () async {
      final api = MessagingApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => http.Response(
            '{"message":"Unknown icebreaker prompt."}',
            400,
            headers: {'content-type': 'application/json'},
          ),
        ),
      );

      expect(
        () => api.sendIcebreaker(matchId: 'match-1', promptId: 'nope'),
        throwsA(isA<MessagingApiException>()),
      );
    });
  });

  group('MessagingApi.respondToIcebreaker', () {
    test('sends the chosen option and parses both sides once revealed', () async {
      final api = MessagingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.method, 'POST');
          expect(request.url.path, '/matches/match-1/messages/m1/icebreaker-response');
          expect(request.body, '{"optionIndex":1}');
          return http.Response(
            '{"id":"m1","senderId":"user-2","contentType":"ICEBREAKER","content":"coffee-or-tea",'
            '"mediaUrl":null,"isBlurred":false,"icebreaker":{"promptId":"coffee-or-tea",'
            '"question":"Coffee or tea?","optionA":"Coffee","optionB":"Tea","myOptionIndex":1,'
            '"otherOptionIndex":0},"createdAt":"2026-01-01T00:00:00.000Z"}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final message = await api.respondToIcebreaker(
        matchId: 'match-1',
        messageId: 'm1',
        optionIndex: 1,
      );

      expect(message.icebreaker!.haveBothAnswered, isTrue);
      expect(message.icebreaker!.otherOptionIndex, 0);
    });
  });
}
