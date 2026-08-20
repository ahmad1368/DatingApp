import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/location/crossed_paths_screen.dart';
import 'package:mobile/location/location_api.dart';

void main() {
  testWidgets('shows an empty state when there are no crossed paths', (tester) async {
    final api = LocationApi(
      accessToken: 'a-jwt',
      client: MockClient(
        (request) async => http.Response('[]', 200, headers: {'content-type': 'application/json'}),
      ),
    );

    await tester.pumpWidget(MaterialApp(home: CrossedPathsScreen(locationApi: api)));
    await tester.pumpAndSettle();

    expect(find.textContaining('No crossed paths yet'), findsOneWidget);
  });

  testWidgets('lists crossed paths with count and closest distance', (tester) async {
    final api = LocationApi(
      accessToken: 'a-jwt',
      client: MockClient(
        (request) async => http.Response(
          '[{"id":"user-2","name":"Jane","profilePhotoUrl":null,"crossCount":3,'
          '"closestDistanceKm":0.03,"lastCrossedAt":"2026-01-01T12:00:00.000Z"}]',
          200,
          headers: {'content-type': 'application/json'},
        ),
      ),
    );

    await tester.pumpWidget(MaterialApp(home: CrossedPathsScreen(locationApi: api)));
    await tester.pumpAndSettle();

    expect(find.text('Jane'), findsOneWidget);
    expect(find.text('Crossed paths 3 times · as close as 30 m'), findsOneWidget);
  });

  testWidgets('singularizes the count when crossed only once', (tester) async {
    final api = LocationApi(
      accessToken: 'a-jwt',
      client: MockClient(
        (request) async => http.Response(
          '[{"id":"user-2","name":"Jane","profilePhotoUrl":null,"crossCount":1,'
          '"closestDistanceKm":0.05,"lastCrossedAt":"2026-01-01T12:00:00.000Z"}]',
          200,
          headers: {'content-type': 'application/json'},
        ),
      ),
    );

    await tester.pumpWidget(MaterialApp(home: CrossedPathsScreen(locationApi: api)));
    await tester.pumpAndSettle();

    expect(find.text('Crossed paths once · as close as 50 m'), findsOneWidget);
  });

  testWidgets('shows an error when the request fails', (tester) async {
    final api = LocationApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async => http.Response('', 500)),
    );

    await tester.pumpWidget(MaterialApp(home: CrossedPathsScreen(locationApi: api)));
    await tester.pumpAndSettle();

    expect(find.textContaining('Request failed'), findsOneWidget);
  });
}
