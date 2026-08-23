import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/social_graph/social_contacts_screen.dart';
import 'package:mobile/social_graph/social_graph_api.dart';

void main() {
  testWidgets('syncing contacts shows a confirmation with the synced count', (tester) async {
    http.Request? syncRequest;
    final api = SocialGraphApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        syncRequest = request;
        return http.Response(
          '{"totalSynced":2}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(MaterialApp(home: SocialContactsScreen(socialGraphApi: api)));

    await tester.enterText(
      find.byType(TextField),
      '+15551234567, friend@example.com',
    );
    await tester.tap(find.widgetWithText(ElevatedButton, 'Sync contacts'));
    await tester.pumpAndSettle();

    expect(syncRequest, isNotNull);
    expect(syncRequest!.body, '{"contacts":["+15551234567","friend@example.com"]}');
    expect(find.textContaining('Synced 2 contacts'), findsOneWidget);
  });

  testWidgets('shows an error message when syncing fails', (tester) async {
    final api = SocialGraphApi(
      accessToken: 'a-jwt',
      client: MockClient(
        (request) async => http.Response(
          '{"message":"Something went wrong."}',
          500,
          headers: {'content-type': 'application/json'},
        ),
      ),
    );

    await tester.pumpWidget(MaterialApp(home: SocialContactsScreen(socialGraphApi: api)));

    await tester.enterText(find.byType(TextField), '+15551234567');
    await tester.tap(find.widgetWithText(ElevatedButton, 'Sync contacts'));
    await tester.pumpAndSettle();

    expect(find.text('Something went wrong.'), findsOneWidget);
  });
}
