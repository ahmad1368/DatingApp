import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/curated_profiles/curated_profiles_api.dart';
import 'package:mobile/curated_profiles/daily_picks_screen.dart';
import 'package:mobile/discovery/discovery_api.dart';

const _picksResponse = '[{"id":"user-2","name":"Jane","age":25,"profilePhotoUrl":null,'
    '"compatibilityPercentage":92}]';
const _countdownResponse = '{"nextRefreshAt":"2026-01-02T12:00:00.000Z"}';

http.Response _routedResponse(http.Request request, String picksBody) {
  if (request.url.path == '/curated-profiles/refresh-countdown') {
    return http.Response(_countdownResponse, 200, headers: {'content-type': 'application/json'});
  }
  return http.Response(picksBody, 200, headers: {'content-type': 'application/json'});
}

void main() {
  testWidgets('shows an empty state when there are no picks today', (tester) async {
    final curatedApi = CuratedProfilesApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async => _routedResponse(request, '[]')),
    );
    final discoveryApi = DiscoveryApi(accessToken: 'a-jwt', client: MockClient((request) async => http.Response('{}', 200)));

    await tester.pumpWidget(
      MaterialApp(
        home: DailyPicksScreen(curatedProfilesApi: curatedApi, discoveryApi: discoveryApi),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text("You're all caught up for today."), findsOneWidget);

    await tester.pumpWidget(Container());
  });

  testWidgets('shows a live countdown to the next refresh', (tester) async {
    final curatedApi = CuratedProfilesApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async => _routedResponse(request, '[]')),
    );
    final discoveryApi = DiscoveryApi(accessToken: 'a-jwt', client: MockClient((request) async => http.Response('{}', 200)));

    await tester.pumpWidget(
      MaterialApp(
        home: DailyPicksScreen(curatedProfilesApi: curatedApi, discoveryApi: discoveryApi),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Next picks in'), findsOneWidget);

    await tester.pumpWidget(Container());
  });

  testWidgets('lists picks with compatibility and records a like', (tester) async {
    http.Request? capturedRequest;
    final curatedApi = CuratedProfilesApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async => _routedResponse(request, _picksResponse)),
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

    await tester.pumpWidget(Container());
  });

  testWidgets('shows a standout badge for highly-engaged picks', (tester) async {
    const standoutResponse = '[{"id":"user-2","name":"Jane","age":25,"profilePhotoUrl":null,'
        '"compatibilityPercentage":92,"isStandout":true}]';
    final curatedApi = CuratedProfilesApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async => _routedResponse(request, standoutResponse)),
    );
    final discoveryApi = DiscoveryApi(accessToken: 'a-jwt', client: MockClient((request) async => http.Response('{}', 200)));

    await tester.pumpWidget(
      MaterialApp(
        home: DailyPicksScreen(curatedProfilesApi: curatedApi, discoveryApi: discoveryApi),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('92% compatible · Standout'), findsOneWidget);
    expect(find.byIcon(Icons.local_fire_department), findsOneWidget);

    await tester.pumpWidget(Container());
  });
}
