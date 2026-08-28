import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/messaging/inactive_threads_screen.dart';
import 'package:mobile/messaging/messaging_api.dart';

http.Response _jsonResponse(String body, int status) =>
    http.Response(body, status, headers: {'content-type': 'application/json'});

const _emptyMessages = '[]';

void main() {
  testWidgets('shows an empty state when nothing is inactive', (tester) async {
    final api = MessagingApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async => _jsonResponse('[]', 200)),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: InactiveThreadsScreen(messagingApi: api, currentUserId: 'user-1'),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('No inactive conversations.'), findsOneWidget);
  });

  testWidgets('lists inactive threads and opens the live chat on tap', (tester) async {
    final api = MessagingApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/matches/inactive') {
          return _jsonResponse(
            '[{"matchId":"match-1","otherUserId":"user-2",'
            '"otherUserName":"Sam","otherUserPhotoUrl":null,'
            '"lastMessageAt":"2026-01-02T00:00:00.000Z"}]',
            200,
          );
        }
        if (request.url.path.endsWith('/messages')) {
          return _jsonResponse(_emptyMessages, 200);
        }
        return _jsonResponse(
          '{"matchId":"match-1","expiresAt":null,"isExpired":false,'
          '"firstMessageSent":true,"canSendFirstMessage":true}',
          200,
        );
      }),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: InactiveThreadsScreen(messagingApi: api, currentUserId: 'user-1'),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Sam'), findsOneWidget);
    expect(find.textContaining('Last message'), findsOneWidget);

    await tester.tap(find.text('Sam'));
    await tester.pumpAndSettle();

    expect(find.text('Chat'), findsOneWidget);
  });

  testWidgets('shows an error when loading fails', (tester) async {
    final api = MessagingApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async => _jsonResponse('{"message":"boom"}', 500)),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: InactiveThreadsScreen(messagingApi: api, currentUserId: 'user-1'),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('boom'), findsOneWidget);
  });
}
