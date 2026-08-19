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
      client: MockClient(
        (request) async => http.Response(
          '[{"matchId":"match-1","otherUserId":"user-2","otherUserName":"Jane",'
          '"otherUserPhotoUrl":null,"expiresAt":null,'
          '"firstMessageSent":true,"createdAt":"2026-01-01T00:00:00.000Z"}]',
          200,
          headers: {'content-type': 'application/json'},
        ),
      ),
    );

    await tester.pumpWidget(
      MaterialApp(home: MatchesScreen(messagingApi: api, currentUserId: 'user-1')),
    );
    await tester.pump();
    await tester.pump();

    expect(find.text('Chat unlocked'), findsOneWidget);
  });
}
