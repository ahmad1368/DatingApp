import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/messaging/match_chat_screen.dart';
import 'package:mobile/messaging/messaging_api.dart';

const _emptyMessages = '[]';

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
}
