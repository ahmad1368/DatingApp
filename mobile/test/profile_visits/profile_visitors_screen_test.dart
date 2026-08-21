import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/discovery/profile_visitors_screen.dart';
import 'package:mobile/discovery/profile_visits_api.dart';

void main() {
  testWidgets('shows an empty state when there are no visitors', (tester) async {
    final api = ProfileVisitsApi(
      accessToken: 'a-jwt',
      client: MockClient(
        (request) async => http.Response('[]', 200, headers: {'content-type': 'application/json'}),
      ),
    );

    await tester.pumpWidget(MaterialApp(home: ProfileVisitorsScreen(profileVisitsApi: api)));
    await tester.pumpAndSettle();

    expect(find.text('No visitors yet.'), findsOneWidget);
  });

  testWidgets('lists visitors with their name', (tester) async {
    final api = ProfileVisitsApi(
      accessToken: 'a-jwt',
      client: MockClient(
        (request) async => http.Response(
          '[{"visitorId":"user-3","visitorName":"Sam","visitorPhotoUrl":null,'
          '"visitedAt":"2026-01-01T00:00:00.000Z"}]',
          200,
          headers: {'content-type': 'application/json'},
        ),
      ),
    );

    await tester.pumpWidget(MaterialApp(home: ProfileVisitorsScreen(profileVisitsApi: api)));
    await tester.pumpAndSettle();

    expect(find.text('Sam'), findsOneWidget);
  });

  testWidgets('shows an upsell error for a non-premium user', (tester) async {
    final api = ProfileVisitsApi(
      accessToken: 'a-jwt',
      client: MockClient(
        (request) async => http.Response(
          '{"message":"Seeing your profile visitors is a premium feature."}',
          403,
          headers: {'content-type': 'application/json'},
        ),
      ),
    );

    await tester.pumpWidget(MaterialApp(home: ProfileVisitorsScreen(profileVisitsApi: api)));
    await tester.pumpAndSettle();

    expect(find.text('Seeing your profile visitors is a premium feature.'), findsOneWidget);
  });
}
