import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/messaging/matches_screen.dart';
import 'package:mobile/messaging/messaging_api.dart';

void main() {
  testWidgets('shows an empty state when there are no matches', (tester) async {
    final api = MessagingApi(
      accessToken: 'a-jwt',
      client: MockClient(
        (request) async => http.Response('[]', 200, headers: {'content-type': 'application/json'}),
      ),
    );

    await tester.pumpWidget(
      MaterialApp(home: MatchesScreen(messagingApi: api, currentUserId: 'user-1')),
    );
    await tester.pump();
    await tester.pump();

    expect(find.text('No matches yet.'), findsOneWidget);
  });

  testWidgets('lists matches with a countdown and opens the chat on tap', (tester) async {
    final api = MessagingApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/matches') {
          return http.Response(
            '[{"matchId":"match-1","otherUserId":"user-2","otherUserName":"Jane",'
            '"otherUserPhotoUrl":null,"expiresAt":"${DateTime.now().add(const Duration(hours: 5)).toIso8601String()}",'
            '"firstMessageSent":false,"createdAt":"2026-01-01T00:00:00.000Z"}]',
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        if (request.url.path == '/matches/match-1/messages') {
          return http.Response('[]', 200, headers: {'content-type': 'application/json'});
        }
        if (request.url.path == '/matches/reconnectable') {
          return http.Response('[]', 200, headers: {'content-type': 'application/json'});
        }
        return http.Response(
          '{"matchId":"match-1","expiresAt":null,"isExpired":false,'
          '"firstMessageSent":false,"canSendFirstMessage":true}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(
      MaterialApp(home: MatchesScreen(messagingApi: api, currentUserId: 'user-1')),
    );
    await tester.pump();
    await tester.pump();

    expect(find.text('Jane'), findsOneWidget);
    expect(find.textContaining('left to say something'), findsOneWidget);

    await tester.tap(find.text('Jane'));
    await tester.pump();
    await tester.pump();

    expect(find.text('Chat'), findsOneWidget);
  });

  testWidgets('shows "Chat unlocked" once the first message has been sent', (tester) async {
    final api = MessagingApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/matches/reconnectable') {
          return http.Response('[]', 200, headers: {'content-type': 'application/json'});
        }
        return http.Response(
          '[{"matchId":"match-1","otherUserId":"user-2","otherUserName":"Jane",'
          '"otherUserPhotoUrl":null,"expiresAt":null,'
          '"firstMessageSent":true,"createdAt":"2026-01-01T00:00:00.000Z"}]',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(
      MaterialApp(home: MatchesScreen(messagingApi: api, currentUserId: 'user-1')),
    );
    await tester.pump();
    await tester.pump();

    expect(find.text('Chat unlocked'), findsOneWidget);
  });

  testWidgets('extending a match removes the extend button', (tester) async {
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
        if (request.url.path == '/matches/reconnectable') {
          return http.Response('[]', 200, headers: {'content-type': 'application/json'});
        }
        return http.Response(
          '[{"matchId":"match-1","otherUserId":"user-2","otherUserName":"Jane",'
          '"otherUserPhotoUrl":null,"expiresAt":"${DateTime.now().add(const Duration(hours: 5)).toIso8601String()}",'
          '"firstMessageSent":false,"canExtend":true,"createdAt":"2026-01-01T00:00:00.000Z"}]',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(
      MaterialApp(home: MatchesScreen(messagingApi: api, currentUserId: 'user-1')),
    );
    await tester.pump();
    await tester.pump();

    expect(find.byIcon(Icons.timer_outlined), findsOneWidget);

    await tester.tap(find.byIcon(Icons.timer_outlined));
    await tester.pump();
    await tester.pump();

    expect(extendRequest, isNotNull);
    expect(find.byIcon(Icons.timer_outlined), findsNothing);
  });

  testWidgets('shows a reconnect section and reconnecting refreshes the list', (tester) async {
    var reconnected = false;
    final api = MessagingApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.method == 'POST' && request.url.path == '/matches/reconnect/dissolved-1') {
          reconnected = true;
          return http.Response(
            '{"matchId":"match-2","expiresAt":"2026-01-05T00:00:00.000Z",'
            '"isExpired":false,"firstMessageSent":false,"canSendFirstMessage":true,'
            '"canExtend":true}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        if (request.url.path == '/matches/reconnectable') {
          return http.Response(
            reconnected
                ? '[]'
                : '[{"dissolvedMatchId":"dissolved-1","otherUserId":"user-2",'
                    '"otherUserName":"Jane","otherUserPhotoUrl":null,'
                    '"dissolvedAt":"2026-01-01T00:00:00.000Z"}]',
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response('[]', 200, headers: {'content-type': 'application/json'});
      }),
    );

    await tester.pumpWidget(
      MaterialApp(home: MatchesScreen(messagingApi: api, currentUserId: 'user-1')),
    );
    await tester.pump();
    await tester.pump();

    expect(find.text('Reconnect'), findsNWidgets(2));
    expect(find.text('Jane'), findsOneWidget);

    await tester.tap(find.widgetWithText(ElevatedButton, 'Reconnect'));
    await tester.pump();
    await tester.pump();
    await tester.pump();

    expect(reconnected, isTrue);
    expect(find.widgetWithText(ElevatedButton, 'Reconnect'), findsNothing);
  });

  testWidgets('shows a ghosting nudge and unmatching removes the match', (tester) async {
    http.Request? unmatchRequest;
    final api = MessagingApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.method == 'POST' && request.url.path == '/matches/match-1/unmatch') {
          unmatchRequest = request;
          return http.Response('', 200);
        }
        if (request.url.path == '/matches/reconnectable') {
          return http.Response('[]', 200, headers: {'content-type': 'application/json'});
        }
        return http.Response(
          '[{"matchId":"match-1","otherUserId":"user-2","otherUserName":"Jane",'
          '"otherUserPhotoUrl":null,"expiresAt":null,"firstMessageSent":true,'
          '"createdAt":"2026-01-01T00:00:00.000Z","needsGhostingPrompt":true}]',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(
      MaterialApp(home: MatchesScreen(messagingApi: api, currentUserId: 'user-1')),
    );
    await tester.pump();
    await tester.pump();

    expect(find.textContaining("okay to unmatch"), findsOneWidget);
    expect(find.text('Unmatch'), findsOneWidget);

    await tester.tap(find.text('Unmatch'));
    await tester.pump();
    await tester.pump();

    expect(unmatchRequest, isNotNull);
    expect(find.text('No matches yet.'), findsOneWidget);
  });

  testWidgets('opens archived conversations from the app bar', (tester) async {
    final api = MessagingApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/matches/archived') {
          return http.Response('[]', 200, headers: {'content-type': 'application/json'});
        }
        return http.Response('[]', 200, headers: {'content-type': 'application/json'});
      }),
    );

    await tester.pumpWidget(
      MaterialApp(home: MatchesScreen(messagingApi: api, currentUserId: 'user-1')),
    );
    await tester.pump();
    await tester.pump();

    await tester.tap(find.byIcon(Icons.archive_outlined));
    await tester.pumpAndSettle();

    expect(find.text('Archived Conversations'), findsOneWidget);
  });

  testWidgets('opens inactive conversations from the app bar', (tester) async {
    final api = MessagingApi(
      accessToken: 'a-jwt',
      client: MockClient(
        (request) async => http.Response('[]', 200, headers: {'content-type': 'application/json'}),
      ),
    );

    await tester.pumpWidget(
      MaterialApp(home: MatchesScreen(messagingApi: api, currentUserId: 'user-1')),
    );
    await tester.pump();
    await tester.pump();

    await tester.tap(find.byIcon(Icons.schedule_outlined));
    await tester.pumpAndSettle();

    expect(find.text('Inactive Conversations'), findsOneWidget);
  });
}
