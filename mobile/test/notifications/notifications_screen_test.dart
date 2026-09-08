import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/notifications/notifications_api.dart';
import 'package:mobile/notifications/notifications_screen.dart';

void main() {
  testWidgets('shows a distinct icon per notification type instead of a generic bell', (
    tester,
  ) async {
    final api = NotificationsApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        return http.Response(
          '{"notifications":['
          '{"id":"n1","type":"NEW_MATCH","title":"It\'s a match!","body":"b","read":false,'
          '"createdAt":"2026-01-01T00:00:00.000Z"},'
          '{"id":"n2","type":"NEW_MESSAGE","title":"New message","body":"b","read":false,'
          '"createdAt":"2026-01-01T00:00:00.000Z"},'
          '{"id":"n3","type":"TOP_PICK","title":"Top pick","body":"b","read":true,'
          '"createdAt":"2026-01-01T00:00:00.000Z"}'
          '],"unreadCount":2}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(
      MaterialApp(home: NotificationsScreen(notificationsApi: api)),
    );
    await tester.pumpAndSettle();

    expect(find.byIcon(Icons.favorite), findsOneWidget);
    expect(find.byIcon(Icons.chat_bubble), findsOneWidget);
    expect(find.byIcon(Icons.star), findsOneWidget);
    expect(find.byIcon(Icons.notifications), findsNothing);
    expect(find.byIcon(Icons.notifications_none), findsNothing);
  });
}
