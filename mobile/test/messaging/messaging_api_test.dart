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
            '"firstMessageSent":false,"canExtend":true,"createdAt":"2026-01-01T00:00:00.000Z"}]',
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
      expect(matches.first.canExtend, isTrue);
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
            '"isExpired":false,"firstMessageSent":false,"canSendFirstMessage":true,'
            '"canExtend":true}',
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
      expect(status.canExtend, isTrue);
    });

    test('throws MessagingApiException on a non-200 response', () async {
      final api = MessagingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async => http.Response('{"message":"Match not found."}', 404)),
      );

      expect(() => api.fetchMatchStatus('missing'), throwsA(isA<MessagingApiException>()));
    });

    test("parses the other user's snooze status message when present", () async {
      final api = MessagingApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => http.Response(
            '{"matchId":"match-1","expiresAt":null,'
            '"isExpired":false,"firstMessageSent":true,"canSendFirstMessage":true,'
            '"canExtend":false,"otherUserSnoozeStatusMessage":"On Vacation"}',
            200,
            headers: {'content-type': 'application/json'},
          ),
        ),
      );

      final status = await api.fetchMatchStatus('match-1');

      expect(status.otherUserSnoozeStatusMessage, 'On Vacation');
    });

    test("parses the other user's last-active timestamp when present", () async {
      final api = MessagingApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => http.Response(
            '{"matchId":"match-1","expiresAt":null,'
            '"isExpired":false,"firstMessageSent":true,"canSendFirstMessage":true,'
            '"canExtend":false,"otherUserLastActiveAt":"2026-01-02T00:00:00.000Z"}',
            200,
            headers: {'content-type': 'application/json'},
          ),
        ),
      );

      final status = await api.fetchMatchStatus('match-1');

      expect(status.otherUserLastActiveAt, DateTime.parse('2026-01-02T00:00:00.000Z'));
    });

    test('leaves the last-active timestamp null when withheld by ghosting protection', () async {
      final api = MessagingApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => http.Response(
            '{"matchId":"match-1","expiresAt":null,'
            '"isExpired":false,"firstMessageSent":true,"canSendFirstMessage":true,'
            '"canExtend":false}',
            200,
            headers: {'content-type': 'application/json'},
          ),
        ),
      );

      final status = await api.fetchMatchStatus('match-1');

      expect(status.otherUserLastActiveAt, isNull);
    });
  });

  group('MessagingApi.extendMatchTimeLimit', () {
    test('sends a POST and parses the updated status', () async {
      final api = MessagingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.method, 'POST');
          expect(request.url.path, '/matches/match-1/extend');
          return http.Response(
            '{"matchId":"match-1","expiresAt":"2026-01-03T00:00:00.000Z",'
            '"isExpired":false,"firstMessageSent":false,"canSendFirstMessage":true,'
            '"canExtend":false}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final status = await api.extendMatchTimeLimit('match-1');

      expect(status.expiresAt, DateTime.parse('2026-01-03T00:00:00.000Z'));
      expect(status.canExtend, isFalse);
    });

    test('throws MessagingApiException when the match has already been extended', () async {
      final api = MessagingApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => http.Response(
            '{"message":"This match has already been extended once."}',
            400,
            headers: {'content-type': 'application/json'},
          ),
        ),
      );

      expect(() => api.extendMatchTimeLimit('match-1'), throwsA(isA<MessagingApiException>()));
    });
  });

  group('MessagingApi.requestVerification', () {
    test('sends a POST and parses the updated status', () async {
      final api = MessagingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.method, 'POST');
          expect(request.url.path, '/matches/match-1/request-verification');
          return http.Response(
            '{"matchId":"match-1","expiresAt":null,"isExpired":false,'
            '"firstMessageSent":true,"canSendFirstMessage":true,"canExtend":false,'
            '"otherUserIsVerified":false,"verificationRequested":true,'
            '"verificationRequestedByMe":true}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final status = await api.requestVerification('match-1');

      expect(status.verificationRequested, isTrue);
      expect(status.verificationRequestedByMe, isTrue);
    });

    test('throws MessagingApiException when the other user is already verified', () async {
      final api = MessagingApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => http.Response(
            '{"message":"This person is already verified."}',
            400,
            headers: {'content-type': 'application/json'},
          ),
        ),
      );

      expect(() => api.requestVerification('match-1'), throwsA(isA<MessagingApiException>()));
    });
  });

  group('MessagingApi.fetchReconnectableMatches', () {
    test('sends the bearer token and parses the dissolved matches', () async {
      final api = MessagingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.headers['Authorization'], 'Bearer a-jwt');
          expect(request.url.path, '/matches/reconnectable');
          return http.Response(
            '[{"dissolvedMatchId":"dissolved-1","otherUserId":"user-2",'
            '"otherUserName":"Sam","otherUserPhotoUrl":"sam.jpg",'
            '"dissolvedAt":"2026-01-02T00:00:00.000Z"}]',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final matches = await api.fetchReconnectableMatches();

      expect(matches, hasLength(1));
      expect(matches.first.dissolvedMatchId, 'dissolved-1');
      expect(matches.first.otherUserName, 'Sam');
    });

    test('throws MessagingApiException on a non-200 response', () async {
      final api = MessagingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async => http.Response('', 500)),
      );

      expect(() => api.fetchReconnectableMatches(), throwsA(isA<MessagingApiException>()));
    });
  });

  group('MessagingApi.reconnectMatch', () {
    test('sends a POST and parses the new match status', () async {
      final api = MessagingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.method, 'POST');
          expect(request.url.path, '/matches/reconnect/dissolved-1');
          return http.Response(
            '{"matchId":"match-2","expiresAt":"2026-01-05T00:00:00.000Z",'
            '"isExpired":false,"firstMessageSent":false,"canSendFirstMessage":true,'
            '"canExtend":true}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final status = await api.reconnectMatch('dissolved-1');

      expect(status.matchId, 'match-2');
      expect(status.isExpired, isFalse);
    });

    test('throws MessagingApiException when the user is not premium', () async {
      final api = MessagingApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => http.Response(
            '{"message":"Reconnecting an expired match is a premium feature."}',
            403,
            headers: {'content-type': 'application/json'},
          ),
        ),
      );

      expect(() => api.reconnectMatch('dissolved-1'), throwsA(isA<MessagingApiException>()));
    });
  });

  group('MessagingApi.fetchInactiveThreads', () {
    test('sends the bearer token and parses the inactive threads', () async {
      final api = MessagingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.headers['Authorization'], 'Bearer a-jwt');
          expect(request.url.path, '/matches/inactive');
          return http.Response(
            '[{"matchId":"match-1","otherUserId":"user-2",'
            '"otherUserName":"Sam","otherUserPhotoUrl":"sam.jpg",'
            '"lastMessageAt":"2026-01-02T00:00:00.000Z"}]',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final threads = await api.fetchInactiveThreads();

      expect(threads, hasLength(1));
      expect(threads.first.matchId, 'match-1');
      expect(threads.first.otherUserName, 'Sam');
    });

    test('throws MessagingApiException on a non-200 response', () async {
      final api = MessagingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async => http.Response('', 500)),
      );

      expect(() => api.fetchInactiveThreads(), throwsA(isA<MessagingApiException>()));
    });
  });

  group('MessagingApi.fetchArchivedThreads', () {
    test('sends the bearer token and parses the archived threads', () async {
      final api = MessagingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.headers['Authorization'], 'Bearer a-jwt');
          expect(request.url.path, '/matches/archived');
          return http.Response(
            '[{"dissolvedMatchId":"dissolved-1","otherUserId":"user-2",'
            '"otherUserName":"Sam","otherUserPhotoUrl":"sam.jpg",'
            '"dissolvedAt":"2026-01-02T00:00:00.000Z","messageCount":3}]',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final threads = await api.fetchArchivedThreads();

      expect(threads, hasLength(1));
      expect(threads.first.dissolvedMatchId, 'dissolved-1');
      expect(threads.first.messageCount, 3);
    });

    test('throws MessagingApiException on a non-200 response', () async {
      final api = MessagingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async => http.Response('', 500)),
      );

      expect(() => api.fetchArchivedThreads(), throwsA(isA<MessagingApiException>()));
    });
  });

  group('MessagingApi.fetchArchivedThreadMessages', () {
    test('sends the bearer token and parses the archived messages', () async {
      final api = MessagingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.url.path, '/matches/archived/dissolved-1/messages');
          return http.Response(
            '[{"id":"am-1","senderId":"user-2","contentType":"TEXT","content":"hi",'
            '"mediaUrl":null,"createdAt":"2026-01-01T00:00:00.000Z"}]',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final messages = await api.fetchArchivedThreadMessages('dissolved-1');

      expect(messages, hasLength(1));
      expect(messages.first.content, 'hi');
    });

    test('throws MessagingApiException on a non-200 response', () async {
      final api = MessagingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async => http.Response('', 404)),
      );

      expect(
        () => api.fetchArchivedThreadMessages('dissolved-1'),
        throwsA(isA<MessagingApiException>()),
      );
    });
  });

  group('MessagingApi.unmatch', () {
    test('sends a POST to the unmatch endpoint', () async {
      http.Request? capturedRequest;
      final api = MessagingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          capturedRequest = request;
          return http.Response('', 200);
        }),
      );

      await api.unmatch('match-1');

      expect(capturedRequest, isNotNull);
      expect(capturedRequest!.method, 'POST');
      expect(capturedRequest!.url.path, '/matches/match-1/unmatch');
    });

    test('throws MessagingApiException on a non-200 response', () async {
      final api = MessagingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async => http.Response('', 500)),
      );

      expect(() => api.unmatch('match-1'), throwsA(isA<MessagingApiException>()));
    });
  });

  group('MessagingApi.fetchMatchNote', () {
    test('sends the bearer token and parses the saved note', () async {
      final api = MessagingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.headers['Authorization'], 'Bearer a-jwt');
          expect(request.url.path, '/matches/match-1/note');
          return http.Response(
            '{"content":"Loves hiking","updatedAt":"2026-01-01T00:00:00.000Z"}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final note = await api.fetchMatchNote('match-1');

      expect(note.content, 'Loves hiking');
      expect(note.updatedAt, DateTime.parse('2026-01-01T00:00:00.000Z'));
    });

    test('parses a null content when nothing has been saved yet', () async {
      final api = MessagingApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => http.Response(
            '{"content":null,"updatedAt":null}',
            200,
            headers: {'content-type': 'application/json'},
          ),
        ),
      );

      final note = await api.fetchMatchNote('match-1');

      expect(note.content, isNull);
      expect(note.updatedAt, isNull);
    });
  });

  group('MessagingApi.setMatchNote', () {
    test('sends the content and parses the updated note', () async {
      http.Request? putRequest;
      final api = MessagingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          putRequest = request;
          return http.Response(
            '{"content":"Loves hiking","updatedAt":"2026-01-01T00:00:00.000Z"}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final note = await api.setMatchNote('match-1', 'Loves hiking');

      expect(putRequest, isNotNull);
      expect(putRequest!.method, 'PUT');
      expect(putRequest!.url.path, '/matches/match-1/note');
      expect(putRequest!.body, '{"content":"Loves hiking"}');
      expect(note.content, 'Loves hiking');
    });

    test('throws MessagingApiException on a non-200 response', () async {
      final api = MessagingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async => http.Response('', 500)),
      );

      expect(() => api.setMatchNote('match-1', 'x'), throwsA(isA<MessagingApiException>()));
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

    test('parses moderationFlagged and moderationCategories when present', () async {
      final api = MessagingApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => http.Response(
            '{"id":"m3","senderId":"user-1","contentType":"IMAGE","content":null,'
            '"mediaUrl":"https://example.com/photo.jpg","isBlurred":true,'
            '"moderationFlagged":true,"moderationCategories":["sexual"],'
            '"createdAt":"2026-01-01T00:00:00.000Z"}',
            201,
            headers: {'content-type': 'application/json'},
          ),
        ),
      );

      final message = await api.sendMediaMessage(
        matchId: 'match-1',
        contentType: 'IMAGE',
        mediaUrl: 'https://example.com/photo.jpg',
      );

      expect(message.moderationFlagged, isTrue);
      expect(message.moderationCategories, ['sexual']);
    });

    test('sends expiryMode and viewTimerSeconds for an auto-expiring attachment', () async {
      final api = MessagingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(
            request.body,
            '{"contentType":"IMAGE","mediaUrl":"https://example.com/photo.jpg",'
            '"expiryMode":"TIMER","viewTimerSeconds":5}',
          );
          return http.Response(
            '{"id":"m3","senderId":"user-1","contentType":"IMAGE","content":null,'
            '"mediaUrl":null,"isBlurred":true,"expiryMode":"TIMER","viewTimerSeconds":5,'
            '"isEphemeralExpired":false,"createdAt":"2026-01-01T00:00:00.000Z"}',
            201,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final message = await api.sendMediaMessage(
        matchId: 'match-1',
        contentType: 'IMAGE',
        mediaUrl: 'https://example.com/photo.jpg',
        expiryMode: 'TIMER',
        viewTimerSeconds: 5,
      );

      expect(message.expiryMode, 'TIMER');
      expect(message.viewTimerSeconds, 5);
      expect(message.isEphemeral, isTrue);
      expect(message.mediaUrl, isNull);
    });

    test('sends durationSeconds for a video reaction and parses the result', () async {
      final api = MessagingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(
            request.body,
            '{"contentType":"VIDEO_REACTION","mediaUrl":"file:///tmp/clip.mp4","durationSeconds":5}',
          );
          return http.Response(
            '{"id":"m4","senderId":"user-1","contentType":"VIDEO_REACTION","content":null,'
            '"mediaUrl":"file:///tmp/clip.mp4","isBlurred":false,"durationSeconds":5,'
            '"createdAt":"2026-01-01T00:00:00.000Z"}',
            201,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final message = await api.sendMediaMessage(
        matchId: 'match-1',
        contentType: 'VIDEO_REACTION',
        mediaUrl: 'file:///tmp/clip.mp4',
        durationSeconds: 5,
      );

      expect(message.contentType, 'VIDEO_REACTION');
      expect(message.durationSeconds, 5);
    });
  });

  group('MessagingApi.viewEphemeralMedia', () {
    test('sends a POST to the view endpoint and parses the revealed message', () async {
      final api = MessagingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.method, 'POST');
          expect(request.url.path, '/matches/match-1/messages/m3/view');
          return http.Response(
            '{"id":"m3","senderId":"user-2","contentType":"IMAGE","content":null,'
            '"mediaUrl":"https://example.com/photo.jpg","isBlurred":false,'
            '"expiryMode":"VIEW_ONCE","isEphemeralExpired":true,'
            '"createdAt":"2026-01-01T00:00:00.000Z"}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final message = await api.viewEphemeralMedia(matchId: 'match-1', messageId: 'm3');

      expect(message.mediaUrl, 'https://example.com/photo.jpg');
      expect(message.isEphemeralExpired, isTrue);
    });

    test('throws MessagingApiException when the attachment has already expired', () async {
      final api = MessagingApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => http.Response(
            '{"message":"This message has already expired."}',
            400,
            headers: {'content-type': 'application/json'},
          ),
        ),
      );

      expect(
        () => api.viewEphemeralMedia(matchId: 'match-1', messageId: 'm3'),
        throwsA(isA<MessagingApiException>()),
      );
    });
  });

  group('MessagingApi.sendVoiceNote', () {
    test('sends the media URL and duration, parsing the created message', () async {
      final api = MessagingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.method, 'POST');
          expect(request.url.path, '/matches/match-1/voice-note');
          expect(
            request.body,
            '{"mediaUrl":"file:///tmp/note.m4a","durationSeconds":12}',
          );
          return http.Response(
            '{"id":"m5","senderId":"user-1","contentType":"VOICE_NOTE","content":null,'
            '"mediaUrl":"file:///tmp/note.m4a","isBlurred":false,"durationSeconds":12,'
            '"createdAt":"2026-01-01T00:00:00.000Z"}',
            201,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final message = await api.sendVoiceNote(
        matchId: 'match-1',
        mediaUrl: 'file:///tmp/note.m4a',
        durationSeconds: 12,
      );

      expect(message.contentType, 'VOICE_NOTE');
      expect(message.durationSeconds, 12);
      expect(message.mediaUrl, 'file:///tmp/note.m4a');
    });

    test('throws MessagingApiException when the backend rejects the request', () async {
      final api = MessagingApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => http.Response(
            '{"message":"durationSeconds must not be greater than 60"}',
            400,
            headers: {'content-type': 'application/json'},
          ),
        ),
      );

      expect(
        () => api.sendVoiceNote(matchId: 'match-1', mediaUrl: 'file:///tmp/note.m4a', durationSeconds: 90),
        throwsA(isA<MessagingApiException>()),
      );
    });

    test('includes the voice effect and background sound when provided', () async {
      final api = MessagingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(
            request.body,
            '{"mediaUrl":"file:///tmp/note.m4a","durationSeconds":12,'
            '"voiceEffectId":"robot","backgroundSoundId":"rain"}',
          );
          return http.Response(
            '{"id":"m6","senderId":"user-1","contentType":"VOICE_NOTE","content":null,'
            '"mediaUrl":"file:///tmp/note.m4a","isBlurred":false,"durationSeconds":12,'
            '"voiceEffectId":"robot","backgroundSoundId":"rain",'
            '"createdAt":"2026-01-01T00:00:00.000Z"}',
            201,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final message = await api.sendVoiceNote(
        matchId: 'match-1',
        mediaUrl: 'file:///tmp/note.m4a',
        durationSeconds: 12,
        voiceEffectId: 'robot',
        backgroundSoundId: 'rain',
      );

      expect(message.voiceEffectId, 'robot');
      expect(message.backgroundSoundId, 'rain');
    });

    test('parses the auto-generated transcript when present', () async {
      final api = MessagingApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => http.Response(
            '{"id":"m7","senderId":"user-1","contentType":"VOICE_NOTE","content":null,'
            '"mediaUrl":"file:///tmp/note.m4a","isBlurred":false,"durationSeconds":12,'
            '"transcript":"running a bit late!","createdAt":"2026-01-01T00:00:00.000Z"}',
            201,
            headers: {'content-type': 'application/json'},
          ),
        ),
      );

      final message = await api.sendVoiceNote(
        matchId: 'match-1',
        mediaUrl: 'file:///tmp/note.m4a',
        durationSeconds: 12,
      );

      expect(message.transcript, 'running a bit late!');
    });
  });

  group('MessagingApi.fetchVoiceNoteEffects', () {
    test('parses the voice effect and background sound catalogs', () async {
      final api = MessagingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.url.path, '/matches/voice-note-effects');
          return http.Response(
            '{"voiceEffects":[{"id":"robot","label":"Robot"}],'
            '"backgroundSounds":[{"id":"rain","label":"Rain"}]}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final catalog = await api.fetchVoiceNoteEffects();

      expect(catalog.voiceEffects.single.id, 'robot');
      expect(catalog.backgroundSounds.single.label, 'Rain');
    });

    test('throws MessagingApiException on a non-200 response', () async {
      final api = MessagingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async => http.Response('', 500)),
      );

      expect(() => api.fetchVoiceNoteEffects(), throwsA(isA<MessagingApiException>()));
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

  group('MessagingApi.setMediaBlurPreference', () {
    test('sends a PUT with the enabled flag and parses the result', () async {
      final api = MessagingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.method, 'PUT');
          expect(request.url.path, '/matches/media-blur-preference');
          expect(request.body, '{"enabled":false}');
          return http.Response(
            '{"autoBlurIncomingMedia":false}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final result = await api.setMediaBlurPreference(false);

      expect(result, isFalse);
    });

    test('throws MessagingApiException on a non-200 response', () async {
      final api = MessagingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async => http.Response('', 500)),
      );

      expect(() => api.setMediaBlurPreference(true), throwsA(isA<MessagingApiException>()));
    });
  });

  group('MessagingApi.fetchMediaBlurPreference', () {
    test('sends a GET and parses the result', () async {
      final api = MessagingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.method, 'GET');
          expect(request.url.path, '/matches/media-blur-preference');
          return http.Response(
            '{"autoBlurIncomingMedia":true}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final result = await api.fetchMediaBlurPreference();

      expect(result, isTrue);
    });

    test('throws MessagingApiException on a non-200 response', () async {
      final api = MessagingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async => http.Response('', 500)),
      );

      expect(() => api.fetchMediaBlurPreference(), throwsA(isA<MessagingApiException>()));
    });
  });

  group('MessagingApi.recordActivity', () {
    test('sends a PUT heartbeat and parses the timestamp', () async {
      final api = MessagingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.method, 'PUT');
          expect(request.url.path, '/matches/activity-ping');
          return http.Response(
            '{"lastActiveAt":"2026-01-02T00:00:00.000Z"}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final result = await api.recordActivity();

      expect(result, DateTime.parse('2026-01-02T00:00:00.000Z'));
    });

    test('throws MessagingApiException on a non-200 response', () async {
      final api = MessagingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async => http.Response('', 500)),
      );

      expect(() => api.recordActivity(), throwsA(isA<MessagingApiException>()));
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

  group('MessagingApi.fetchSuggestedIcebreaker', () {
    test('parses the suggested prompt', () async {
      final api = MessagingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.url.path, '/matches/match-1/suggested-icebreaker');
          return http.Response(
            '{"id":"coffee-or-tea","question":"Coffee or tea?","optionA":"Coffee","optionB":"Tea"}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final prompt = await api.fetchSuggestedIcebreaker('match-1');

      expect(prompt?.id, 'coffee-or-tea');
      expect(prompt?.optionA, 'Coffee');
    });

    test('returns null once the match has left its window or already played', () async {
      final api = MessagingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async => http.Response('null', 200, headers: {'content-type': 'application/json'})),
      );

      final prompt = await api.fetchSuggestedIcebreaker('match-1');

      expect(prompt, isNull);
    });

    test('throws MessagingApiException on a non-200 response', () async {
      final api = MessagingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async => http.Response('', 500)),
      );

      expect(() => api.fetchSuggestedIcebreaker('match-1'), throwsA(isA<MessagingApiException>()));
    });
  });

  group('MessagingApi.fetchIcebreakerSuggestions', () {
    test('parses the list of AI-suggested opening lines', () async {
      final api = MessagingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.url.path, '/matches/match-1/icebreaker-suggestions');
          return http.Response(
            '["Ask about their trip","What is your favorite hiking spot?"]',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final suggestions = await api.fetchIcebreakerSuggestions('match-1');

      expect(suggestions, ['Ask about their trip', 'What is your favorite hiking spot?']);
    });

    test('throws MessagingApiException on a non-200 response', () async {
      final api = MessagingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async => http.Response('', 500)),
      );

      expect(() => api.fetchIcebreakerSuggestions('match-1'), throwsA(isA<MessagingApiException>()));
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

  group('MessagingApi.sendPoll', () {
    test('sends the question and options, parsing the created message', () async {
      final api = MessagingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.method, 'POST');
          expect(request.url.path, '/matches/match-1/poll');
          expect(request.body, '{"question":"Where should we go?","options":["Coffee","Dinner"]}');
          return http.Response(
            '{"id":"m1","senderId":"user-1","contentType":"POLL","content":"Where should we go?",'
            '"mediaUrl":null,"isBlurred":false,"poll":{"question":"Where should we go?",'
            '"options":["Coffee","Dinner"],"myOptionIndex":null,"voteCounts":[0,0],"totalVotes":0},'
            '"createdAt":"2026-01-01T00:00:00.000Z"}',
            201,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final message = await api.sendPoll(
        matchId: 'match-1',
        question: 'Where should we go?',
        options: ['Coffee', 'Dinner'],
      );

      expect(message.contentType, 'POLL');
      expect(message.poll, isNotNull);
      expect(message.poll!.options, ['Coffee', 'Dinner']);
      expect(message.poll!.haveIVoted, isFalse);
    });

    test('throws MessagingApiException when there are too few options', () async {
      final api = MessagingApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => http.Response(
            '{"message":"A poll needs between 2 and 6 options."}',
            400,
            headers: {'content-type': 'application/json'},
          ),
        ),
      );

      expect(
        () => api.sendPoll(matchId: 'match-1', question: 'Where?', options: ['Only one']),
        throwsA(isA<MessagingApiException>()),
      );
    });
  });

  group('MessagingApi.respondToPoll', () {
    test('sends the chosen option and parses the updated tally', () async {
      final api = MessagingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.method, 'POST');
          expect(request.url.path, '/matches/match-1/messages/m1/poll-response');
          expect(request.body, '{"optionIndex":1}');
          return http.Response(
            '{"id":"m1","senderId":"user-2","contentType":"POLL","content":"Where should we go?",'
            '"mediaUrl":null,"isBlurred":false,"poll":{"question":"Where should we go?",'
            '"options":["Coffee","Dinner"],"myOptionIndex":1,"voteCounts":[1,1],"totalVotes":2},'
            '"createdAt":"2026-01-01T00:00:00.000Z"}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final message = await api.respondToPoll(matchId: 'match-1', messageId: 'm1', optionIndex: 1);

      expect(message.poll!.haveIVoted, isTrue);
      expect(message.poll!.voteCounts, [1, 1]);
      expect(message.poll!.totalVotes, 2);
    });
  });

  group('MessagingApi.sendReservation', () {
    test('sends the provider and query, parsing the created message', () async {
      final api = MessagingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.method, 'POST');
          expect(request.url.path, '/matches/match-1/reservation');
          expect(request.body, '{"provider":"OPENTABLE","query":"Luigi\'s"}');
          return http.Response(
            '{"id":"m1","senderId":"user-1","contentType":"RESERVATION","content":"Luigi\'s",'
            '"mediaUrl":null,"isBlurred":false,"reservation":{"provider":"OPENTABLE",'
            '"query":"Luigi\'s","url":"https://www.opentable.com/s?term=Luigi\'s"},'
            '"createdAt":"2026-01-01T00:00:00.000Z"}',
            201,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final message = await api.sendReservation(
        matchId: 'match-1',
        provider: 'OPENTABLE',
        query: "Luigi's",
      );

      expect(message.contentType, 'RESERVATION');
      expect(message.reservation, isNotNull);
      expect(message.reservation!.provider, 'OPENTABLE');
      expect(message.reservation!.url, "https://www.opentable.com/s?term=Luigi's");
    });

    test('throws MessagingApiException for an unknown provider', () async {
      final api = MessagingApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => http.Response(
            '{"message":"Unknown reservation provider."}',
            400,
            headers: {'content-type': 'application/json'},
          ),
        ),
      );

      expect(
        () => api.sendReservation(matchId: 'match-1', provider: 'RESY', query: "Luigi's"),
        throwsA(isA<MessagingApiException>()),
      );
    });
  });

  group('MessagingApi.sendGiftMessage', () {
    test('sends the gift id and optional message, parsing the created message', () async {
      final api = MessagingApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.method, 'POST');
          expect(request.url.path, '/matches/match-1/gift');
          expect(request.body, '{"giftId":"rose","message":"For you!"}');
          return http.Response(
            '{"id":"m1","senderId":"user-1","contentType":"GIFT","content":"rose",'
            '"mediaUrl":null,"isBlurred":false,'
            '"gift":{"giftId":"rose","name":"Rose","emoji":"🌹","tokenCost":10},'
            '"createdAt":"2026-01-01T00:00:00.000Z"}',
            201,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final message = await api.sendGiftMessage(
        matchId: 'match-1',
        giftId: 'rose',
        message: 'For you!',
      );

      expect(message.contentType, 'GIFT');
      expect(message.gift, isNotNull);
      expect(message.gift!.name, 'Rose');
      expect(message.gift!.tokenCost, 10);
    });

    test('throws MessagingApiException for insufficient token balance', () async {
      final api = MessagingApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => http.Response(
            '{"message":"Not enough gift tokens for this gift."}',
            400,
            headers: {'content-type': 'application/json'},
          ),
        ),
      );

      expect(
        () => api.sendGiftMessage(matchId: 'match-1', giftId: 'crown'),
        throwsA(isA<MessagingApiException>()),
      );
    });
  });
}
