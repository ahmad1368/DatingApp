import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/messaging/archived_threads_screen.dart';
import 'package:mobile/messaging/messaging_api.dart';

http.Response _jsonResponse(String body, int status) =>
    http.Response(body, status, headers: {'content-type': 'application/json'});

void main() {
  testWidgets('shows an empty state when there is nothing archived', (tester) async {
    final api = MessagingApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async => _jsonResponse('[]', 200)),
    );

    await tester.pumpWidget(MaterialApp(home: ArchivedThreadsScreen(messagingApi: api)));
    await tester.pumpAndSettle();

    expect(find.text('No archived conversations.'), findsOneWidget);
  });

  testWidgets('lists archived threads and opens the transcript on tap', (tester) async {
    final api = MessagingApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/matches/archived') {
          return _jsonResponse(
            '[{"dissolvedMatchId":"dissolved-1","otherUserId":"user-2",'
            '"otherUserName":"Sam","otherUserPhotoUrl":null,'
            '"dissolvedAt":"2026-01-02T00:00:00.000Z","messageCount":2}]',
            200,
          );
        }
        if (request.url.path == '/matches/archived/dissolved-1/messages') {
          return _jsonResponse(
            '[{"id":"am-1","senderId":"user-2","contentType":"TEXT","content":"hi there",'
            '"mediaUrl":null,"createdAt":"2026-01-01T00:00:00.000Z"}]',
            200,
          );
        }
        return _jsonResponse('[]', 200);
      }),
    );

    await tester.pumpWidget(MaterialApp(home: ArchivedThreadsScreen(messagingApi: api)));
    await tester.pumpAndSettle();

    expect(find.text('Sam'), findsOneWidget);
    expect(find.textContaining('2 message(s)'), findsOneWidget);

    await tester.tap(find.text('Sam'));
    await tester.pumpAndSettle();

    expect(find.text('hi there'), findsOneWidget);
  });

  testWidgets('shows an error when loading fails', (tester) async {
    final api = MessagingApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async => _jsonResponse('{"message":"boom"}', 500)),
    );

    await tester.pumpWidget(MaterialApp(home: ArchivedThreadsScreen(messagingApi: api)));
    await tester.pumpAndSettle();

    expect(find.text('boom'), findsOneWidget);
  });
}
