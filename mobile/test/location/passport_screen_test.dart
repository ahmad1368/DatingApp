import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/location/passport_api.dart';
import 'package:mobile/location/passport_screen.dart';

// A 1x1 transparent PNG, so tests never hit the real tile network.
final Uint8List _fakeTileBytes = base64Decode(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
);

class _FakeTileProvider extends TileProvider {
  @override
  ImageProvider getImage(TileCoordinates coordinates, TileLayer options) {
    return MemoryImage(_fakeTileBytes);
  }
}

void main() {
  testWidgets('picking a point on the map enables setting a passport location', (tester) async {
    http.Request? capturedRequest;
    final api = PassportApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        capturedRequest = request;
        return http.Response(
          '{"passportEnabled":true,"latitude":20,"longitude":0}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: PassportScreen(passportApi: api, tileProvider: _FakeTileProvider()),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('No location selected'), findsOneWidget);
    final setButtonFinder = find.widgetWithText(ElevatedButton, 'Set passport location');
    expect(tester.widget<ElevatedButton>(setButtonFinder).onPressed, isNull);

    // flutter_map debounces taps ~250ms to detect a possible double-tap-zoom.
    await tester.tapAt(tester.getCenter(find.byType(FlutterMap)));
    await tester.pump(const Duration(milliseconds: 300));

    expect(tester.widget<ElevatedButton>(setButtonFinder).onPressed, isNotNull);

    await tester.tap(setButtonFinder);
    await tester.pumpAndSettle();

    expect(capturedRequest, isNotNull);
    expect(capturedRequest!.url.path, '/location/passport');
    expect(find.text('Passport location set. You\'ll now match with people there.'), findsOneWidget);
  });

  testWidgets('shows the backend error when passport is not available', (tester) async {
    final api = PassportApi(
      accessToken: 'a-jwt',
      client: MockClient(
        (request) async => http.Response(
          '{"message":"Passport is a premium feature. Upgrade to use it."}',
          403,
          headers: {'content-type': 'application/json'},
        ),
      ),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: PassportScreen(passportApi: api, tileProvider: _FakeTileProvider()),
      ),
    );
    await tester.pumpAndSettle();

    // flutter_map debounces taps ~250ms to detect a possible double-tap-zoom.
    await tester.tapAt(tester.getCenter(find.byType(FlutterMap)));
    await tester.pump(const Duration(milliseconds: 300));
    await tester.tap(find.widgetWithText(ElevatedButton, 'Set passport location'));
    await tester.pumpAndSettle();

    expect(find.text('Passport is a premium feature. Upgrade to use it.'), findsOneWidget);
  });

  testWidgets('disabling passport calls the backend', (tester) async {
    http.Request? capturedRequest;
    final api = PassportApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        capturedRequest = request;
        return http.Response(
          '{"passportEnabled":false,"latitude":20,"longitude":0}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: PassportScreen(passportApi: api, tileProvider: _FakeTileProvider()),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.widgetWithText(OutlinedButton, 'Disable passport'));
    await tester.pumpAndSettle();

    expect(capturedRequest, isNotNull);
    expect(capturedRequest!.method, 'DELETE');
    expect(find.text('Passport disabled. Back to your real location.'), findsOneWidget);
  });
}
