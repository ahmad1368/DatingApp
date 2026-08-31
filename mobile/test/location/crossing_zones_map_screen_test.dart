import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/location/crossing_zones_map_screen.dart';
import 'package:mobile/location/location_api.dart';

void main() {
  testWidgets('shows an empty state when there are no crossing zones today', (tester) async {
    final api = LocationApi(
      accessToken: 'a-jwt',
      client: MockClient(
        (request) async => http.Response('[]', 200, headers: {'content-type': 'application/json'}),
      ),
    );

    await tester.pumpWidget(MaterialApp(home: CrossingZonesMapScreen(locationApi: api)));
    await tester.pumpAndSettle();

    expect(find.textContaining('No crossed paths yet today'), findsOneWidget);
  });

  testWidgets('plots a marker per zone and shows a hint before one is selected', (tester) async {
    final api = LocationApi(
      accessToken: 'a-jwt',
      client: MockClient(
        (request) async => http.Response(
          '[{"zoneId":"40.713,-73.935","latitude":40.713,"longitude":-73.935,'
          '"crossingCount":3,"uniqueUserCount":2,"lastCrossedAt":"2026-01-01T12:00:00.000Z"},'
          '{"zoneId":"34.052,-118.244","latitude":34.052,"longitude":-118.244,'
          '"crossingCount":1,"uniqueUserCount":1,"lastCrossedAt":"2026-01-01T09:00:00.000Z"}]',
          200,
          headers: {'content-type': 'application/json'},
        ),
      ),
    );

    await tester.pumpWidget(MaterialApp(home: CrossingZonesMapScreen(locationApi: api)));
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey('zone-40.713,-73.935')), findsOneWidget);
    expect(find.byKey(const ValueKey('zone-34.052,-118.244')), findsOneWidget);
    expect(find.text('Tap a zone to see details.'), findsOneWidget);
  });

  testWidgets('tapping a zone marker shows its crossing and people count', (tester) async {
    final api = LocationApi(
      accessToken: 'a-jwt',
      client: MockClient(
        (request) async => http.Response(
          '[{"zoneId":"40.713,-73.935","latitude":40.713,"longitude":-73.935,'
          '"crossingCount":3,"uniqueUserCount":2,"lastCrossedAt":"2026-01-01T12:00:00.000Z"}]',
          200,
          headers: {'content-type': 'application/json'},
        ),
      ),
    );

    await tester.pumpWidget(MaterialApp(home: CrossingZonesMapScreen(locationApi: api)));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const ValueKey('zone-40.713,-73.935')));
    await tester.pump();

    expect(find.text('3 crossings · 2 people'), findsOneWidget);
  });

  testWidgets('singularizes the count for a single crossing with one person', (tester) async {
    final api = LocationApi(
      accessToken: 'a-jwt',
      client: MockClient(
        (request) async => http.Response(
          '[{"zoneId":"40.713,-73.935","latitude":40.713,"longitude":-73.935,'
          '"crossingCount":1,"uniqueUserCount":1,"lastCrossedAt":"2026-01-01T12:00:00.000Z"}]',
          200,
          headers: {'content-type': 'application/json'},
        ),
      ),
    );

    await tester.pumpWidget(MaterialApp(home: CrossingZonesMapScreen(locationApi: api)));
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const ValueKey('zone-40.713,-73.935')));
    await tester.pump();

    expect(find.text('1 crossing · 1 person'), findsOneWidget);
  });

  testWidgets('shows an error when the request fails', (tester) async {
    final api = LocationApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async => http.Response('', 500)),
    );

    await tester.pumpWidget(MaterialApp(home: CrossingZonesMapScreen(locationApi: api)));
    await tester.pumpAndSettle();

    expect(find.textContaining('Request failed'), findsOneWidget);
  });
}
