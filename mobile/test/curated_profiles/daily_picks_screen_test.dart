import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/curated_profiles/curated_profiles_api.dart';
import 'package:mobile/curated_profiles/daily_picks_screen.dart';
import 'package:mobile/discovery/discovery_api.dart';

const _picksResponse = '[{"id":"user-2","name":"Jane","age":25,"profilePhotoUrl":null,'
    '"compatibilityPercentage":92}]';

void main() {
  testWidgets('shows an empty state when there are no picks today', (tester) async {
    final curatedApi = CuratedProfilesApi(
      accessToken: 'a-jwt',
      client: MockClient(
        (request) async => http.Response('[]', 200, headers: {'content-type': 'application/json'}),
      ),
    );
    final discoveryApi = DiscoveryApi(accessToken: 'a-jwt', client: MockClient((request) async => http.Response('{}', 200)));

    await tester.pumpWidget(
      MaterialApp(
        home: DailyPicksScreen(curatedProfilesApi: curatedApi, discoveryApi: discoveryApi),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text("You're all caught up. Check back at noon!"), findsOneWidget);
  });

  testWidgets('lists picks with compatibility and records a like', (tester) async {
    http.Request? capturedRequest;
    final curatedApi = CuratedProfilesApi(
      accessToken: 'a-jwt',
      client: MockClient(
        (request) async =>
            http.Response(_picksResponse, 200, headers: {'content-type': 'application/json'}),
      ),
    );
    final discoveryApi = DiscoveryApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        capturedRequest = request;
        return http.Response(
          '{"matched":false}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: DailyPicksScreen(curatedProfilesApi: curatedApi, discoveryApi: discoveryApi),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Jane, 25'), findsOneWidget);
    expect(find.text('92% compatible'), findsOneWidget);

    await tester.tap(find.byIcon(Icons.favorite));
    await tester.pumpAndSettle();

    expect(capturedRequest, isNotNull);
    expect(capturedRequest!.body, '{"targetUserId":"user-2","action":"LIKE"}');
    expect(find.text('Jane, 25'), findsNothing);
  });
}
