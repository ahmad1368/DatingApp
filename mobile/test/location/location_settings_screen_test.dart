import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/location/location_api.dart';
import 'package:mobile/location/location_settings_screen.dart';

void main() {
  testWidgets('sharing location updates the backend and shows nearby users', (tester) async {
    final requestedPaths = <String>[];
    final api = LocationApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        requestedPaths.add(request.url.path);
        if (request.url.path == '/location') {
          return http.Response(
            '{"latitude":51.5,"longitude":-0.12,"locationUpdatedAt":"2026-01-01T00:00:00.000Z"}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response(
          '[{"id":"user-2","name":"Jane","distanceKm":3.4}]',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: LocationSettingsScreen(
          locationApi: api,
          currentPositionProvider: () async => const Coordinates(latitude: 51.5, longitude: -0.12),
        ),
      ),
    );

    await tester.tap(find.text('Share my location'));
    await tester.pumpAndSettle();

    expect(requestedPaths, containsAll(['/location', '/location/nearby']));
    expect(find.text('Location updated.'), findsOneWidget);
    expect(find.text('Jane'), findsOneWidget);
    expect(find.text('3.4 km away'), findsOneWidget);
  });

  testWidgets('shows an error when the position provider fails', (tester) async {
    final api = LocationApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async => http.Response('', 500)),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: LocationSettingsScreen(
          locationApi: api,
          currentPositionProvider: () async =>
              throw LocationApiException('Location permission is required to find matches nearby.'),
        ),
      ),
    );

    await tester.tap(find.text('Share my location'));
    await tester.pumpAndSettle();

    expect(find.text('Location permission is required to find matches nearby.'), findsOneWidget);
  });

  testWidgets('saving the radius calls the backend', (tester) async {
    final requestedBodies = <String>[];
    final api = LocationApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        requestedBodies.add(request.body);
        if (request.url.path == '/location/radius') {
          return http.Response(
            '{"searchRadiusKm":50}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response('[]', 200, headers: {'content-type': 'application/json'});
      }),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: LocationSettingsScreen(
          locationApi: api,
          currentPositionProvider: () async => const Coordinates(latitude: 0, longitude: 0),
        ),
      ),
    );

    await tester.tap(find.text('Save radius'));
    await tester.pumpAndSettle();

    expect(requestedBodies, contains('{"radiusKm":50}'));
    expect(find.text('Search radius saved.'), findsOneWidget);
  });

  testWidgets('switching to miles converts the displayed radius and persists the unit', (tester) async {
    final requestedBodies = <String>[];
    final api = LocationApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        requestedBodies.add(request.body);
        if (request.url.path == '/location/radius/unit') {
          return http.Response(
            '{"searchRadiusKm":50,"autoExpandRadiusEnabled":true,"distanceUnit":"MI"}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response('[]', 200, headers: {'content-type': 'application/json'});
      }),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: LocationSettingsScreen(
          locationApi: api,
          currentPositionProvider: () async => const Coordinates(latitude: 0, longitude: 0),
        ),
      ),
    );

    expect(find.text('Search radius: 50 km'), findsOneWidget);

    await tester.tap(find.text('mi'));
    await tester.pumpAndSettle();

    expect(find.text('Search radius: 31 mi'), findsOneWidget);
    expect(requestedBodies, contains('{"unit":"MI"}'));
  });

  testWidgets('loads the saved radius settings on open', (tester) async {
    final api = LocationApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/location/radius' && request.method == 'GET') {
          return http.Response(
            '{"searchRadiusKm":80,"autoExpandRadiusEnabled":false,"distanceUnit":"KM"}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response('[]', 200, headers: {'content-type': 'application/json'});
      }),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: LocationSettingsScreen(
          locationApi: api,
          currentPositionProvider: () async => const Coordinates(latitude: 0, longitude: 0),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Search radius: 80 km'), findsOneWidget);
    final toggle = tester.widget<SwitchListTile>(find.byType(SwitchListTile));
    expect(toggle.value, isFalse);
  });

  testWidgets('toggling auto-expand radius calls the backend', (tester) async {
    http.Request? putRequest;
    final api = LocationApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/location/radius/auto-expand') {
          putRequest = request;
          return http.Response(
            '{"searchRadiusKm":50,"autoExpandRadiusEnabled":false,"distanceUnit":"KM"}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response('[]', 200, headers: {'content-type': 'application/json'});
      }),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: LocationSettingsScreen(
          locationApi: api,
          currentPositionProvider: () async => const Coordinates(latitude: 0, longitude: 0),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byType(SwitchListTile));
    await tester.pumpAndSettle();

    expect(putRequest, isNotNull);
    expect(putRequest!.body, '{"enabled":false}');
    final toggle = tester.widget<SwitchListTile>(find.byType(SwitchListTile));
    expect(toggle.value, isFalse);
  });

  testWidgets('shows an error and reverts the toggle when saving fails', (tester) async {
    final api = LocationApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/location/radius/auto-expand') {
          return http.Response('{"message":"Not premium."}', 403);
        }
        return http.Response('[]', 200, headers: {'content-type': 'application/json'});
      }),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: LocationSettingsScreen(
          locationApi: api,
          currentPositionProvider: () async => const Coordinates(latitude: 0, longitude: 0),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byType(SwitchListTile));
    await tester.pumpAndSettle();

    expect(find.text('Not premium.'), findsOneWidget);
    final toggle = tester.widget<SwitchListTile>(find.byType(SwitchListTile));
    expect(toggle.value, isTrue);
  });
}
