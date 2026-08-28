import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/messaging/date_suggestions_api.dart';
import 'package:mobile/messaging/match_chat_screen.dart';
import 'package:mobile/messaging/messaging_api.dart';
import 'package:mobile/profile/voice_player_controller.dart';
import 'package:mobile/profile/voice_recorder_controller.dart';
import 'package:mobile/vault/vault_api.dart';

const _emptyMessages = '[]';

class _FakeRecorder implements VoiceRecorderController {
  bool granted = true;
  bool started = false;
  String stopPath = 'file:///tmp/fake-note.m4a';

  @override
  Future<bool> hasPermission() async => granted;

  @override
  Future<void> start() async {
    started = true;
  }

  @override
  Future<String?> stop() async => stopPath;
}

class _FakePlayer implements VoicePlayerController {
  String? lastPlayedPath;
  double? lastPlayedSpeed;

  @override
  Future<void> play(String path, {double speed = 1.0}) async {
    lastPlayedPath = path;
    lastPlayedSpeed = speed;
  }

  @override
  Future<void> stop() async {}
}

void main() {
  testWidgets('hides the composer and shows a banner while waiting on her first message', (
    tester,
  ) async {
    final api = MessagingApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path.endsWith('/messages')) {
          return http.Response(_emptyMessages, 200, headers: {'content-type': 'application/json'});
        }
        return http.Response(
          '{"matchId":"match-1","expiresAt":"2026-01-02T00:00:00.000Z",'
          '"isExpired":false,"firstMessageSent":false,"canSendFirstMessage":false}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: MatchChatScreen(messagingApi: api, matchId: 'match-1', currentUserId: 'user-man'),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Waiting for her to send the first message.'), findsOneWidget);
    expect(find.byType(TextField), findsNothing);
  });

  testWidgets('lets the woman type and send the first message', (tester) async {
    http.Request? sendRequest;
    final api = MessagingApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/matches/moderation/check') {
          return http.Response(
            '{"flagged":false,"categories":[]}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        if (request.method == 'POST') {
          sendRequest = request;
          return http.Response(
            '{"id":"m1","senderId":"user-woman","contentType":"TEXT","content":"hi!",'
            '"mediaUrl":null,"isBlurred":false,"createdAt":"2026-01-01T00:00:00.000Z"}',
            201,
            headers: {'content-type': 'application/json'},
          );
        }
        if (request.url.path.endsWith('/messages')) {
          return http.Response(_emptyMessages, 200, headers: {'content-type': 'application/json'});
        }
        return http.Response(
          '{"matchId":"match-1","expiresAt":"2026-01-02T00:00:00.000Z",'
          '"isExpired":false,"firstMessageSent":false,"canSendFirstMessage":true}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: MatchChatScreen(messagingApi: api, matchId: 'match-1', currentUserId: 'user-woman'),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.byType(TextField), findsOneWidget);

    await tester.enterText(find.byType(TextField), 'hi!');
    await tester.tap(find.byIcon(Icons.send));
    await tester.pumpAndSettle();

    expect(sendRequest, isNotNull);
    expect(sendRequest!.body, '{"content":"hi!"}');
    expect(find.text('hi!'), findsOneWidget);
  });

  testWidgets('shows an expired banner and no composer once the match has expired', (tester) async {
    final api = MessagingApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path.endsWith('/messages')) {
          return http.Response(_emptyMessages, 200, headers: {'content-type': 'application/json'});
        }
        return http.Response(
          '{"matchId":"match-1","expiresAt":"2026-01-02T00:00:00.000Z",'
          '"isExpired":true,"firstMessageSent":false,"canSendFirstMessage":false}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: MatchChatScreen(messagingApi: api, matchId: 'match-1', currentUserId: 'user-man'),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('This match has expired.'), findsOneWidget);
    expect(find.byType(TextField), findsNothing);
  });

  testWidgets('shows a tap-to-reveal overlay for a blurred photo from the other person', (
    tester,
  ) async {
    final api = MessagingApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path.endsWith('/messages')) {
          return http.Response(
            '[{"id":"m1","senderId":"user-woman","contentType":"IMAGE","content":null,'
            '"mediaUrl":"https://example.com/photo.jpg","isBlurred":true,'
            '"createdAt":"2026-01-01T00:00:00.000Z"}]',
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response(
          '{"matchId":"match-1","expiresAt":null,"isExpired":false,'
          '"firstMessageSent":true,"canSendFirstMessage":true}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: MatchChatScreen(messagingApi: api, matchId: 'match-1', currentUserId: 'user-man'),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Tap to reveal'), findsOneWidget);
  });

  testWidgets('shows a sensitive-content warning for a flagged blurred photo', (tester) async {
    final api = MessagingApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path.endsWith('/messages')) {
          return http.Response(
            '[{"id":"m1","senderId":"user-woman","contentType":"IMAGE","content":null,'
            '"mediaUrl":"https://example.com/photo.jpg","isBlurred":true,'
            '"moderationFlagged":true,"moderationCategories":["sexual"],'
            '"createdAt":"2026-01-01T00:00:00.000Z"}]',
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response(
          '{"matchId":"match-1","expiresAt":null,"isExpired":false,'
          '"firstMessageSent":true,"canSendFirstMessage":true}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: MatchChatScreen(messagingApi: api, matchId: 'match-1', currentUserId: 'user-man'),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Possibly sensitive content'), findsOneWidget);
    expect(find.text('Tap to reveal'), findsOneWidget);
  });

  testWidgets('does not blur a photo the current user sent themselves', (tester) async {
    final api = MessagingApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path.endsWith('/messages')) {
          return http.Response(
            '[{"id":"m1","senderId":"user-woman","contentType":"IMAGE","content":null,'
            '"mediaUrl":"https://example.com/photo.jpg","isBlurred":true,'
            '"createdAt":"2026-01-01T00:00:00.000Z"}]',
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response(
          '{"matchId":"match-1","expiresAt":null,"isExpired":false,'
          '"firstMessageSent":true,"canSendFirstMessage":true}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: MatchChatScreen(messagingApi: api, matchId: 'match-1', currentUserId: 'user-woman'),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Tap to reveal'), findsNothing);
  });

  testWidgets('tapping a blurred photo reveals it', (tester) async {
    http.Request? revealRequest;
    final api = MessagingApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path.endsWith('/reveal')) {
          revealRequest = request;
          return http.Response(
            '{"id":"m1","senderId":"user-woman","contentType":"IMAGE","content":null,'
            '"mediaUrl":"https://example.com/photo.jpg","isBlurred":false,'
            '"createdAt":"2026-01-01T00:00:00.000Z"}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        if (request.url.path.endsWith('/messages')) {
          return http.Response(
            '[{"id":"m1","senderId":"user-woman","contentType":"IMAGE","content":null,'
            '"mediaUrl":"https://example.com/photo.jpg","isBlurred":true,'
            '"createdAt":"2026-01-01T00:00:00.000Z"}]',
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response(
          '{"matchId":"match-1","expiresAt":null,"isExpired":false,'
          '"firstMessageSent":true,"canSendFirstMessage":true}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: MatchChatScreen(messagingApi: api, matchId: 'match-1', currentUserId: 'user-man'),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Tap to reveal'));
    await tester.pumpAndSettle();

    expect(revealRequest, isNotNull);
    expect(revealRequest!.url.path, '/matches/match-1/messages/m1/reveal');
    expect(find.text('Tap to reveal'), findsNothing);
  });

  testWidgets('shows a tap-to-view prompt for a VIEW_ONCE photo and reveals it once tapped', (
    tester,
  ) async {
    http.Request? viewRequest;
    final api = MessagingApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path.endsWith('/view')) {
          viewRequest = request;
          return http.Response(
            '{"id":"m1","senderId":"user-woman","contentType":"IMAGE","content":null,'
            '"mediaUrl":"https://example.com/photo.jpg","isBlurred":false,'
            '"expiryMode":"VIEW_ONCE","isEphemeralExpired":true,'
            '"createdAt":"2026-01-01T00:00:00.000Z"}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        if (request.url.path.endsWith('/messages')) {
          return http.Response(
            '[{"id":"m1","senderId":"user-woman","contentType":"IMAGE","content":null,'
            '"mediaUrl":null,"isBlurred":false,"expiryMode":"VIEW_ONCE",'
            '"isEphemeralExpired":false,"createdAt":"2026-01-01T00:00:00.000Z"}]',
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response(
          '{"matchId":"match-1","expiresAt":null,"isExpired":false,'
          '"firstMessageSent":true,"canSendFirstMessage":true}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: MatchChatScreen(messagingApi: api, matchId: 'match-1', currentUserId: 'user-man'),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Tap to view once'), findsOneWidget);

    await tester.tap(find.text('Tap to view once'));
    await tester.pumpAndSettle();

    expect(viewRequest, isNotNull);
    expect(viewRequest!.url.path, '/matches/match-1/messages/m1/view');
    expect(find.text('Tap to view once'), findsNothing);
  });

  testWidgets('shows a countdown prompt for a TIMER photo and a status line for the sender', (
    tester,
  ) async {
    final api = MessagingApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path.endsWith('/messages')) {
          return http.Response(
            '[{"id":"m1","senderId":"user-man","contentType":"IMAGE","content":null,'
            '"mediaUrl":null,"isBlurred":false,"expiryMode":"TIMER","viewTimerSeconds":5,'
            '"isEphemeralExpired":false,"createdAt":"2026-01-01T00:00:00.000Z"}]',
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response(
          '{"matchId":"match-1","expiresAt":null,"isExpired":false,'
          '"firstMessageSent":true,"canSendFirstMessage":true}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: MatchChatScreen(messagingApi: api, matchId: 'match-1', currentUserId: 'user-woman'),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Tap to view (disappears in 5s)'), findsOneWidget);
  });

  testWidgets('shows a sent status line for the sender of a disappearing photo', (tester) async {
    final api = MessagingApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path.endsWith('/messages')) {
          return http.Response(
            '[{"id":"m1","senderId":"user-woman","contentType":"IMAGE","content":null,'
            '"mediaUrl":null,"isBlurred":false,"expiryMode":"VIEW_ONCE",'
            '"isEphemeralExpired":false,"createdAt":"2026-01-01T00:00:00.000Z"}]',
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response(
          '{"matchId":"match-1","expiresAt":null,"isExpired":false,'
          '"firstMessageSent":true,"canSendFirstMessage":true}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: MatchChatScreen(messagingApi: api, matchId: 'match-1', currentUserId: 'user-woman'),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Disappearing photo sent'), findsOneWidget);
  });

  testWidgets('shows a photo expired label once an ephemeral photo has expired', (tester) async {
    final api = MessagingApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path.endsWith('/messages')) {
          return http.Response(
            '[{"id":"m1","senderId":"user-woman","contentType":"IMAGE","content":null,'
            '"mediaUrl":null,"isBlurred":false,"expiryMode":"VIEW_ONCE",'
            '"isEphemeralExpired":true,"createdAt":"2026-01-01T00:00:00.000Z"}]',
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response(
          '{"matchId":"match-1","expiresAt":null,"isExpired":false,'
          '"firstMessageSent":true,"canSendFirstMessage":true}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: MatchChatScreen(messagingApi: api, matchId: 'match-1', currentUserId: 'user-man'),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Photo expired'), findsOneWidget);
  });

  testWidgets('opens the GIF picker, searches, and sends the selected GIF', (tester) async {
    http.Request? sendRequest;
    final api = MessagingApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/matches/gifs/search') {
          return http.Response(
            '[{"id":"g1","url":"https://example.com/g1.gif",'
            '"previewUrl":"https://example.com/g1-preview.gif"}]',
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        if (request.url.path.endsWith('/media')) {
          sendRequest = request;
          return http.Response(
            '{"id":"m2","senderId":"user-woman","contentType":"GIF","content":null,'
            '"mediaUrl":"https://example.com/g1.gif","isBlurred":false,'
            '"createdAt":"2026-01-01T00:00:00.000Z"}',
            201,
            headers: {'content-type': 'application/json'},
          );
        }
        if (request.url.path.endsWith('/messages')) {
          return http.Response(_emptyMessages, 200, headers: {'content-type': 'application/json'});
        }
        return http.Response(
          '{"matchId":"match-1","expiresAt":null,"isExpired":false,'
          '"firstMessageSent":true,"canSendFirstMessage":true}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: MatchChatScreen(messagingApi: api, matchId: 'match-1', currentUserId: 'user-woman'),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(Icons.gif_box_outlined));
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField).last, 'cats');
    await tester.tap(find.byIcon(Icons.search));
    await tester.pumpAndSettle();

    await tester.tap(
      find.descendant(of: find.byType(GridView), matching: find.byType(GestureDetector)),
    );
    await tester.pumpAndSettle();

    expect(sendRequest, isNotNull);
    expect(sendRequest!.body, '{"contentType":"GIF","mediaUrl":"https://example.com/g1.gif"}');
  });

  testWidgets('warns before sending a flagged message and only sends after confirming', (
    tester,
  ) async {
    http.Request? sendRequest;
    final api = MessagingApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/matches/moderation/check') {
          return http.Response(
            '{"flagged":true,"categories":["harassment"]}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        if (request.method == 'POST') {
          sendRequest = request;
          return http.Response(
            '{"id":"m1","senderId":"user-woman","contentType":"TEXT","content":"you are the worst",'
            '"mediaUrl":null,"isBlurred":false,"createdAt":"2026-01-01T00:00:00.000Z"}',
            201,
            headers: {'content-type': 'application/json'},
          );
        }
        if (request.url.path.endsWith('/messages')) {
          return http.Response(_emptyMessages, 200, headers: {'content-type': 'application/json'});
        }
        return http.Response(
          '{"matchId":"match-1","expiresAt":"2026-01-02T00:00:00.000Z",'
          '"isExpired":false,"firstMessageSent":false,"canSendFirstMessage":true}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: MatchChatScreen(messagingApi: api, matchId: 'match-1', currentUserId: 'user-woman'),
      ),
    );
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField), 'you are the worst');
    await tester.tap(find.byIcon(Icons.send));
    await tester.pumpAndSettle();

    expect(sendRequest, isNull);
    expect(find.text('Heads up'), findsOneWidget);
    expect(find.textContaining('harassment'), findsOneWidget);

    await tester.tap(find.text('Send anyway'));
    await tester.pumpAndSettle();

    expect(sendRequest, isNotNull);
    expect(sendRequest!.body, '{"content":"you are the worst"}');
  });

  testWidgets('long-pressing a message from the other person reports it', (tester) async {
    http.Request? reportRequest;
    final api = MessagingApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path.endsWith('/report')) {
          reportRequest = request;
          return http.Response('{}', 201, headers: {'content-type': 'application/json'});
        }
        if (request.url.path.endsWith('/messages')) {
          return http.Response(
            '[{"id":"m1","senderId":"user-man","contentType":"TEXT","content":"hey",'
            '"mediaUrl":null,"isBlurred":false,"createdAt":"2026-01-01T00:00:00.000Z"}]',
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response(
          '{"matchId":"match-1","expiresAt":null,"isExpired":false,'
          '"firstMessageSent":true,"canSendFirstMessage":true}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: MatchChatScreen(messagingApi: api, matchId: 'match-1', currentUserId: 'user-woman'),
      ),
    );
    await tester.pumpAndSettle();

    await tester.longPress(find.text('hey'));
    await tester.pumpAndSettle();

    expect(find.text('Report this message'), findsOneWidget);

    await tester.enterText(find.byType(TextField).last, 'harassing me');
    await tester.tap(find.text('Report'));
    await tester.pumpAndSettle();

    expect(reportRequest, isNotNull);
    expect(reportRequest!.url.path, '/matches/match-1/messages/m1/report');
    expect(reportRequest!.body, '{"reason":"harassing me"}');
  });

  testWidgets('shows a Read label under my own message once it has been read', (tester) async {
    final api = MessagingApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path.endsWith('/messages')) {
          return http.Response(
            '[{"id":"m1","senderId":"user-woman","contentType":"TEXT","content":"hi!",'
            '"mediaUrl":null,"isBlurred":false,"readAt":"2026-01-01T00:05:00.000Z",'
            '"createdAt":"2026-01-01T00:00:00.000Z"}]',
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response(
          '{"matchId":"match-1","expiresAt":null,"isExpired":false,'
          '"firstMessageSent":true,"canSendFirstMessage":true}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: MatchChatScreen(messagingApi: api, matchId: 'match-1', currentUserId: 'user-woman'),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Read'), findsOneWidget);
  });

  testWidgets('does not show a Read label for an unread message from the other person', (
    tester,
  ) async {
    final api = MessagingApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path.endsWith('/messages')) {
          return http.Response(
            '[{"id":"m1","senderId":"user-man","contentType":"TEXT","content":"hey",'
            '"mediaUrl":null,"isBlurred":false,"readAt":"2026-01-01T00:05:00.000Z",'
            '"createdAt":"2026-01-01T00:00:00.000Z"}]',
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response(
          '{"matchId":"match-1","expiresAt":null,"isExpired":false,'
          '"firstMessageSent":true,"canSendFirstMessage":true}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: MatchChatScreen(messagingApi: api, matchId: 'match-1', currentUserId: 'user-woman'),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Read'), findsNothing);
  });

  testWidgets('toggling read receipts calls the API and switches the icon', (tester) async {
    http.Request? toggleRequest;
    final api = MessagingApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.method == 'PUT' && request.url.path == '/matches/read-receipts') {
          toggleRequest = request;
          return http.Response(
            '{"readReceiptsEnabled":false}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        if (request.url.path.endsWith('/messages')) {
          return http.Response(_emptyMessages, 200, headers: {'content-type': 'application/json'});
        }
        return http.Response(
          '{"matchId":"match-1","expiresAt":null,"isExpired":false,'
          '"firstMessageSent":true,"canSendFirstMessage":true}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: MatchChatScreen(messagingApi: api, matchId: 'match-1', currentUserId: 'user-woman'),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.byIcon(Icons.done_all), findsOneWidget);

    await tester.tap(find.byIcon(Icons.done_all));
    await tester.pumpAndSettle();

    expect(toggleRequest, isNotNull);
    expect(toggleRequest!.body, '{"enabled":false}');
    expect(find.byIcon(Icons.done), findsOneWidget);
  });

  testWidgets('toggling the media blur preference calls the API and switches the icon', (tester) async {
    http.Request? toggleRequest;
    final api = MessagingApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.method == 'PUT' && request.url.path == '/matches/media-blur-preference') {
          toggleRequest = request;
          return http.Response(
            '{"autoBlurIncomingMedia":false}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        if (request.url.path.endsWith('/messages')) {
          return http.Response(_emptyMessages, 200, headers: {'content-type': 'application/json'});
        }
        return http.Response(
          '{"matchId":"match-1","expiresAt":null,"isExpired":false,'
          '"firstMessageSent":true,"canSendFirstMessage":true}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: MatchChatScreen(messagingApi: api, matchId: 'match-1', currentUserId: 'user-woman'),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.byIcon(Icons.blur_on), findsOneWidget);

    await tester.tap(find.byIcon(Icons.blur_on));
    await tester.pumpAndSettle();

    expect(toggleRequest, isNotNull);
    expect(toggleRequest!.body, '{"enabled":false}');
    expect(find.byIcon(Icons.blur_off), findsOneWidget);
  });

  testWidgets('sending an icebreaker shows response options with no answers yet', (tester) async {
    http.Request? sendRequest;
    final api = MessagingApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/matches/icebreaker-prompts') {
          return http.Response(
            '[{"id":"coffee-or-tea","question":"Coffee or tea?","optionA":"Coffee","optionB":"Tea"}]',
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        if (request.method == 'POST' && request.url.path == '/matches/match-1/icebreaker') {
          sendRequest = request;
          return http.Response(
            '{"id":"m1","senderId":"user-woman","contentType":"ICEBREAKER","content":"coffee-or-tea",'
            '"mediaUrl":null,"isBlurred":false,"icebreaker":{"promptId":"coffee-or-tea",'
            '"question":"Coffee or tea?","optionA":"Coffee","optionB":"Tea","myOptionIndex":null,'
            '"otherOptionIndex":null},"createdAt":"2026-01-01T00:00:00.000Z"}',
            201,
            headers: {'content-type': 'application/json'},
          );
        }
        if (request.url.path.endsWith('/messages')) {
          return http.Response(_emptyMessages, 200, headers: {'content-type': 'application/json'});
        }
        return http.Response(
          '{"matchId":"match-1","expiresAt":null,"isExpired":false,'
          '"firstMessageSent":true,"canSendFirstMessage":true}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: MatchChatScreen(messagingApi: api, matchId: 'match-1', currentUserId: 'user-woman'),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(Icons.quiz_outlined));
    await tester.pumpAndSettle();

    expect(find.text('Coffee or tea?'), findsOneWidget);

    await tester.tap(find.text('Coffee or tea?'));
    await tester.pumpAndSettle();

    expect(sendRequest, isNotNull);
    expect(sendRequest!.body, '{"promptId":"coffee-or-tea"}');
    expect(find.text('Coffee'), findsOneWidget);
    expect(find.text('Tea'), findsOneWidget);
  });

  testWidgets('shows a suggested icebreaker banner and sends it on tap', (tester) async {
    http.Request? sendRequest;
    final api = MessagingApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/matches/match-1/suggested-icebreaker') {
          return http.Response(
            '{"id":"coffee-or-tea","question":"Coffee or tea?","optionA":"Coffee","optionB":"Tea"}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        if (request.method == 'POST' && request.url.path == '/matches/match-1/icebreaker') {
          sendRequest = request;
          return http.Response(
            '{"id":"m1","senderId":"user-woman","contentType":"ICEBREAKER","content":"coffee-or-tea",'
            '"mediaUrl":null,"isBlurred":false,"icebreaker":{"promptId":"coffee-or-tea",'
            '"question":"Coffee or tea?","optionA":"Coffee","optionB":"Tea","myOptionIndex":null,'
            '"otherOptionIndex":null},"createdAt":"2026-01-01T00:00:00.000Z"}',
            201,
            headers: {'content-type': 'application/json'},
          );
        }
        if (request.url.path.endsWith('/messages')) {
          return http.Response(_emptyMessages, 200, headers: {'content-type': 'application/json'});
        }
        return http.Response(
          '{"matchId":"match-1","expiresAt":null,"isExpired":false,'
          '"firstMessageSent":true,"canSendFirstMessage":true}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: MatchChatScreen(messagingApi: api, matchId: 'match-1', currentUserId: 'user-woman'),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Break the ice'), findsOneWidget);
    expect(find.text('Coffee or tea?'), findsOneWidget);

    await tester.tap(find.text('Send'));
    await tester.pumpAndSettle();

    expect(sendRequest, isNotNull);
    expect(sendRequest!.body, '{"promptId":"coffee-or-tea"}');
    expect(find.text('Break the ice'), findsNothing);
  });

  testWidgets('dismisses the suggested icebreaker banner without sending it', (tester) async {
    final api = MessagingApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/matches/match-1/suggested-icebreaker') {
          return http.Response(
            '{"id":"coffee-or-tea","question":"Coffee or tea?","optionA":"Coffee","optionB":"Tea"}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        if (request.url.path.endsWith('/messages')) {
          return http.Response(_emptyMessages, 200, headers: {'content-type': 'application/json'});
        }
        return http.Response(
          '{"matchId":"match-1","expiresAt":null,"isExpired":false,'
          '"firstMessageSent":true,"canSendFirstMessage":true}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: MatchChatScreen(messagingApi: api, matchId: 'match-1', currentUserId: 'user-woman'),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Break the ice'), findsOneWidget);

    await tester.tap(find.byIcon(Icons.close));
    await tester.pumpAndSettle();

    expect(find.text('Break the ice'), findsNothing);
  });

  testWidgets('answering an icebreaker shows my pick while waiting on the other side', (
    tester,
  ) async {
    http.Request? responseRequest;
    final api = MessagingApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.method == 'POST' && request.url.path.endsWith('/icebreaker-response')) {
          responseRequest = request;
          return http.Response(
            '{"id":"m1","senderId":"user-man","contentType":"ICEBREAKER","content":"coffee-or-tea",'
            '"mediaUrl":null,"isBlurred":false,"icebreaker":{"promptId":"coffee-or-tea",'
            '"question":"Coffee or tea?","optionA":"Coffee","optionB":"Tea","myOptionIndex":0,'
            '"otherOptionIndex":null},"createdAt":"2026-01-01T00:00:00.000Z"}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        if (request.url.path.endsWith('/messages')) {
          return http.Response(
            '[{"id":"m1","senderId":"user-man","contentType":"ICEBREAKER","content":"coffee-or-tea",'
            '"mediaUrl":null,"isBlurred":false,"icebreaker":{"promptId":"coffee-or-tea",'
            '"question":"Coffee or tea?","optionA":"Coffee","optionB":"Tea","myOptionIndex":null,'
            '"otherOptionIndex":null},"createdAt":"2026-01-01T00:00:00.000Z"}]',
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response(
          '{"matchId":"match-1","expiresAt":null,"isExpired":false,'
          '"firstMessageSent":true,"canSendFirstMessage":true}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: MatchChatScreen(messagingApi: api, matchId: 'match-1', currentUserId: 'user-woman'),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Coffee'));
    await tester.pumpAndSettle();

    expect(responseRequest, isNotNull);
    expect(responseRequest!.body, '{"optionIndex":0}');
    expect(find.text('You: Coffee'), findsOneWidget);
    expect(find.text('Waiting for their answer...'), findsOneWidget);
  });

  testWidgets('reveals both picks once both people have answered', (tester) async {
    final api = MessagingApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path.endsWith('/messages')) {
          return http.Response(
            '[{"id":"m1","senderId":"user-man","contentType":"ICEBREAKER","content":"coffee-or-tea",'
            '"mediaUrl":null,"isBlurred":false,"icebreaker":{"promptId":"coffee-or-tea",'
            '"question":"Coffee or tea?","optionA":"Coffee","optionB":"Tea","myOptionIndex":1,'
            '"otherOptionIndex":0},"createdAt":"2026-01-01T00:00:00.000Z"}]',
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response(
          '{"matchId":"match-1","expiresAt":null,"isExpired":false,'
          '"firstMessageSent":true,"canSendFirstMessage":true}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: MatchChatScreen(messagingApi: api, matchId: 'match-1', currentUserId: 'user-woman'),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('You: Tea'), findsOneWidget);
    expect(find.text('Them: Coffee'), findsOneWidget);
  });

  testWidgets('extending the match time limit updates the button state', (tester) async {
    http.Request? extendRequest;
    final api = MessagingApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.method == 'POST' && request.url.path == '/matches/match-1/extend') {
          extendRequest = request;
          return http.Response(
            '{"matchId":"match-1","expiresAt":"2026-01-03T00:00:00.000Z",'
            '"isExpired":false,"firstMessageSent":false,"canSendFirstMessage":true,'
            '"canExtend":false}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        if (request.url.path.endsWith('/messages')) {
          return http.Response(_emptyMessages, 200, headers: {'content-type': 'application/json'});
        }
        return http.Response(
          '{"matchId":"match-1","expiresAt":"2026-01-02T00:00:00.000Z",'
          '"isExpired":false,"firstMessageSent":false,"canSendFirstMessage":true,'
          '"canExtend":true}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: MatchChatScreen(messagingApi: api, matchId: 'match-1', currentUserId: 'user-woman'),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Extend 24 hours'), findsOneWidget);

    await tester.tap(find.text('Extend 24 hours'));
    await tester.pumpAndSettle();

    expect(extendRequest, isNotNull);
    expect(find.text('Extend 24 hours'), findsNothing);
  });

  testWidgets('requesting verification updates the banner', (tester) async {
    http.Request? verificationRequest;
    final api = MessagingApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.method == 'POST' &&
            request.url.path == '/matches/match-1/request-verification') {
          verificationRequest = request;
          return http.Response(
            '{"matchId":"match-1","expiresAt":null,"isExpired":false,'
            '"firstMessageSent":true,"canSendFirstMessage":true,"canExtend":false,'
            '"otherUserIsVerified":false,"verificationRequested":true,'
            '"verificationRequestedByMe":true}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        if (request.url.path.endsWith('/messages')) {
          return http.Response(_emptyMessages, 200, headers: {'content-type': 'application/json'});
        }
        return http.Response(
          '{"matchId":"match-1","expiresAt":null,"isExpired":false,'
          '"firstMessageSent":true,"canSendFirstMessage":true,"canExtend":false,'
          '"otherUserIsVerified":false,"verificationRequested":false,'
          '"verificationRequestedByMe":false}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: MatchChatScreen(messagingApi: api, matchId: 'match-1', currentUserId: 'user-woman'),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Request photo verification'), findsOneWidget);

    await tester.tap(find.text('Request photo verification'));
    await tester.pumpAndSettle();

    expect(verificationRequest, isNotNull);
    expect(find.text('Request photo verification'), findsNothing);
    expect(find.text("You've requested photo verification."), findsOneWidget);
  });

  testWidgets("shows a banner when the other user has an active snooze status message", (
    tester,
  ) async {
    final api = MessagingApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path.endsWith('/messages')) {
          return http.Response(_emptyMessages, 200, headers: {'content-type': 'application/json'});
        }
        return http.Response(
          '{"matchId":"match-1","expiresAt":null,"isExpired":false,'
          '"firstMessageSent":true,"canSendFirstMessage":true,"canExtend":false,'
          '"otherUserSnoozeStatusMessage":"On Vacation"}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: MatchChatScreen(messagingApi: api, matchId: 'match-1', currentUserId: 'user-woman'),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text("They're currently away: On Vacation"), findsOneWidget);
  });

  testWidgets("shows the other user's last-active status when visible", (tester) async {
    final api = MessagingApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path.endsWith('/messages')) {
          return http.Response(_emptyMessages, 200, headers: {'content-type': 'application/json'});
        }
        if (request.url.path == '/matches/activity-ping') {
          return http.Response(
            '{"lastActiveAt":"2026-01-01T00:00:00.000Z"}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response(
          '{"matchId":"match-1","expiresAt":null,"isExpired":false,'
          '"firstMessageSent":true,"canSendFirstMessage":true,"canExtend":false,'
          '"otherUserLastActiveAt":"${DateTime.now().subtract(const Duration(minutes: 5)).toIso8601String()}"}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: MatchChatScreen(messagingApi: api, matchId: 'match-1', currentUserId: 'user-woman'),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.textContaining('Active'), findsOneWidget);
  });

  testWidgets("sends an activity heartbeat when the chat is opened", (tester) async {
    final requestedPaths = <String>[];
    final api = MessagingApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        requestedPaths.add(request.url.path);
        if (request.url.path.endsWith('/messages')) {
          return http.Response(_emptyMessages, 200, headers: {'content-type': 'application/json'});
        }
        if (request.url.path == '/matches/activity-ping') {
          return http.Response(
            '{"lastActiveAt":"2026-01-01T00:00:00.000Z"}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response(
          '{"matchId":"match-1","expiresAt":null,"isExpired":false,'
          '"firstMessageSent":true,"canSendFirstMessage":true,"canExtend":false}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: MatchChatScreen(messagingApi: api, matchId: 'match-1', currentUserId: 'user-woman'),
      ),
    );
    await tester.pumpAndSettle();

    expect(requestedPaths, contains('/matches/activity-ping'));
  });

  testWidgets('records and sends a voice note', (tester) async {
    http.Request? sendRequest;
    final api = MessagingApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path.endsWith('/messages')) {
          return http.Response(_emptyMessages, 200, headers: {'content-type': 'application/json'});
        }
        if (request.method == 'POST' && request.url.path == '/matches/match-1/voice-note') {
          sendRequest = request;
          return http.Response(
            '{"id":"m5","senderId":"user-woman","contentType":"VOICE_NOTE","content":null,'
            '"mediaUrl":"file:///tmp/fake-note.m4a","isBlurred":false,"durationSeconds":2,'
            '"createdAt":"2026-01-01T00:00:00.000Z"}',
            201,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response(
          '{"matchId":"match-1","expiresAt":null,"isExpired":false,'
          '"firstMessageSent":true,"canSendFirstMessage":true}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );
    final recorder = _FakeRecorder();
    final player = _FakePlayer();

    await tester.pumpWidget(
      MaterialApp(
        home: MatchChatScreen(
          messagingApi: api,
          matchId: 'match-1',
          currentUserId: 'user-woman',
          recorder: recorder,
          player: player,
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(Icons.mic_none));
    await tester.pump();
    expect(recorder.started, isTrue);
    expect(find.byIcon(Icons.stop_circle), findsOneWidget);

    await tester.pump(const Duration(seconds: 2));
    await tester.tap(find.byIcon(Icons.stop_circle));
    await tester.pumpAndSettle();

    expect(sendRequest, isNotNull);
    expect(sendRequest!.body, contains('"mediaUrl":"file:///tmp/fake-note.m4a"'));
    expect(find.textContaining('voice note'), findsOneWidget);
  });

  testWidgets('shows the auto-generated transcript under a voice note', (tester) async {
    final api = MessagingApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path.endsWith('/messages')) {
          return http.Response(
            '[{"id":"m5","senderId":"user-man","contentType":"VOICE_NOTE","content":null,'
            '"mediaUrl":"file:///tmp/note.m4a","isBlurred":false,"durationSeconds":5,'
            '"transcript":"running a bit late!","createdAt":"2026-01-01T00:00:00.000Z"}]',
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response(
          '{"matchId":"match-1","expiresAt":null,"isExpired":false,'
          '"firstMessageSent":true,"canSendFirstMessage":true}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: MatchChatScreen(messagingApi: api, matchId: 'match-1', currentUserId: 'user-woman'),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('running a bit late!'), findsOneWidget);
  });

  testWidgets('shows an error when microphone permission is denied', (tester) async {
    final api = MessagingApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path.endsWith('/messages')) {
          return http.Response(_emptyMessages, 200, headers: {'content-type': 'application/json'});
        }
        return http.Response(
          '{"matchId":"match-1","expiresAt":null,"isExpired":false,'
          '"firstMessageSent":true,"canSendFirstMessage":true}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );
    final recorder = _FakeRecorder()..granted = false;
    final player = _FakePlayer();

    await tester.pumpWidget(
      MaterialApp(
        home: MatchChatScreen(
          messagingApi: api,
          matchId: 'match-1',
          currentUserId: 'user-woman',
          recorder: recorder,
          player: player,
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(Icons.mic_none));
    await tester.pump();

    expect(
      find.text('Microphone permission is required to send a voice note.'),
      findsOneWidget,
    );
    expect(recorder.started, isFalse);
  });

  testWidgets('tapping play on a voice note plays it back', (tester) async {
    final api = MessagingApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path.endsWith('/messages')) {
          return http.Response(
            '[{"id":"m1","senderId":"user-man","contentType":"VOICE_NOTE","content":null,'
            '"mediaUrl":"file:///tmp/incoming-note.m4a","isBlurred":false,"durationSeconds":5,'
            '"createdAt":"2026-01-01T00:00:00.000Z"}]',
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response(
          '{"matchId":"match-1","expiresAt":null,"isExpired":false,'
          '"firstMessageSent":true,"canSendFirstMessage":true}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );
    final recorder = _FakeRecorder();
    final player = _FakePlayer();

    await tester.pumpWidget(
      MaterialApp(
        home: MatchChatScreen(
          messagingApi: api,
          matchId: 'match-1',
          currentUserId: 'user-woman',
          recorder: recorder,
          player: player,
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('5s voice note'), findsOneWidget);

    await tester.tap(find.byIcon(Icons.play_arrow));
    await tester.pump();

    expect(player.lastPlayedPath, 'file:///tmp/incoming-note.m4a');
    expect(player.lastPlayedSpeed, 1.0);
  });

  testWidgets('cycling the speed button changes playback speed for that voice note', (tester) async {
    final api = MessagingApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path.endsWith('/messages')) {
          return http.Response(
            '[{"id":"m1","senderId":"user-man","contentType":"VOICE_NOTE","content":null,'
            '"mediaUrl":"file:///tmp/incoming-note.m4a","isBlurred":false,"durationSeconds":5,'
            '"createdAt":"2026-01-01T00:00:00.000Z"}]',
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response(
          '{"matchId":"match-1","expiresAt":null,"isExpired":false,'
          '"firstMessageSent":true,"canSendFirstMessage":true}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );
    final player = _FakePlayer();

    await tester.pumpWidget(
      MaterialApp(
        home: MatchChatScreen(
          messagingApi: api,
          matchId: 'match-1',
          currentUserId: 'user-woman',
          player: player,
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('1x'), findsOneWidget);

    await tester.tap(find.text('1x'));
    await tester.pump();
    expect(find.text('1.25x'), findsOneWidget);

    await tester.tap(find.text('1.25x'));
    await tester.pump();
    expect(find.text('1.5x'), findsOneWidget);

    await tester.tap(find.text('1.5x'));
    await tester.pump();
    expect(find.text('2x'), findsOneWidget);

    await tester.tap(find.byIcon(Icons.play_arrow));
    await tester.pump();
    expect(player.lastPlayedSpeed, 2.0);

    await tester.tap(find.text('2x'));
    await tester.pump();
    expect(find.text('1x'), findsOneWidget);
  });

  testWidgets('shows meetup suggestions in a bottom sheet', (tester) async {
    final api = MessagingApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path.endsWith('/messages')) {
          return http.Response(_emptyMessages, 200, headers: {'content-type': 'application/json'});
        }
        return http.Response(
          '{"matchId":"match-1","expiresAt":null,'
          '"isExpired":false,"firstMessageSent":true,"canSendFirstMessage":true}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );
    final dateSuggestionsApi = DateSuggestionsApi(
      accessToken: 'a-jwt',
      client: MockClient(
        (request) async => http.Response(
          '{"midpoint":{"latitude":41.0,"longitude":-73.0},"distanceKm":3.4,'
          '"suggestions":[{"id":"cafe","label":"Coffee Shop","searchQuery":"coffee shop",'
          '"description":"Low-pressure and easy to leave whenever.",'
          '"mapsSearchUrl":"https://www.google.com/maps/search/x"}]}',
          200,
          headers: {'content-type': 'application/json'},
        ),
      ),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: MatchChatScreen(
          messagingApi: api,
          matchId: 'match-1',
          currentUserId: 'user-woman',
          dateSuggestionsApi: dateSuggestionsApi,
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(Icons.place_outlined));
    await tester.pumpAndSettle();

    expect(find.text('Meetup spots ~3.4 km apart'), findsOneWidget);
    expect(find.text('Coffee Shop'), findsOneWidget);
  });

  testWidgets('opens shared private photos for this match', (tester) async {
    final api = MessagingApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path.endsWith('/messages')) {
          return http.Response(_emptyMessages, 200, headers: {'content-type': 'application/json'});
        }
        return http.Response(
          '{"matchId":"match-1","expiresAt":null,'
          '"isExpired":false,"firstMessageSent":true,"canSendFirstMessage":true}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );
    final vaultApi = VaultApi(
      accessToken: 'a-jwt',
      client: MockClient(
        (request) async => http.Response(
          '[{"id":"photo-1","mediaUrl":"https://example.com/a.jpg",'
          '"grantedAt":"2026-01-01T00:00:00.000Z"}]',
          200,
          headers: {'content-type': 'application/json'},
        ),
      ),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: MatchChatScreen(
          messagingApi: api,
          matchId: 'match-1',
          currentUserId: 'user-woman',
          vaultApi: vaultApi,
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(Icons.photo_library_outlined));
    await tester.pumpAndSettle();

    expect(find.text('Shared Private Photos'), findsOneWidget);
  });

  testWidgets('saves a private note only the current user can see', (tester) async {
    http.Request? putRequest;
    final api = MessagingApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path.endsWith('/messages')) {
          return http.Response(_emptyMessages, 200, headers: {'content-type': 'application/json'});
        }
        if (request.url.path.endsWith('/note')) {
          if (request.method == 'PUT') {
            putRequest = request;
            return http.Response(
              '{"content":"Loves hiking","updatedAt":"2026-01-01T00:00:00.000Z"}',
              200,
              headers: {'content-type': 'application/json'},
            );
          }
          return http.Response(
            '{"content":null,"updatedAt":null}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response(
          '{"matchId":"match-1","expiresAt":null,'
          '"isExpired":false,"firstMessageSent":true,"canSendFirstMessage":true}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: MatchChatScreen(messagingApi: api, matchId: 'match-1', currentUserId: 'user-woman'),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(Icons.sticky_note_2_outlined));
    await tester.pumpAndSettle();

    expect(find.text('Private note'), findsOneWidget);

    await tester.enterText(find.byType(TextField).last, 'Loves hiking');
    await tester.tap(find.text('Save'));
    await tester.pumpAndSettle();

    expect(putRequest, isNotNull);
    expect(putRequest!.body, '{"content":"Loves hiking"}');
  });
}
