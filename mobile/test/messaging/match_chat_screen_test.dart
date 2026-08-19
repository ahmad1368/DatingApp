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
        if (request.method == 'POST') {
          sendRequest = request;
          return http.Response(
            '{"id":"m1","senderId":"user-woman","content":"hi!","createdAt":"2026-01-01T00:00:00.000Z"}',
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
}
