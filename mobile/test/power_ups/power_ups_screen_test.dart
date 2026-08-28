import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/power_ups/power_ups_api.dart';
import 'package:mobile/power_ups/power_ups_screen.dart';

http.Response _jsonResponse(String body, int status) =>
    http.Response(body, status, headers: {'content-type': 'application/json'});

const _catalogResponse =
    '[{"id":"boost","label":"Profile Boost (30 min)","coinCost":100}]';

void main() {
  testWidgets('shows the power-up catalog', (tester) async {
    final api = PowerUpsApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async => _jsonResponse(_catalogResponse, 200)),
    );

    await tester.pumpWidget(MaterialApp(home: PowerUpsScreen(powerUpsApi: api)));
    await tester.pumpAndSettle();

    expect(find.text('Profile Boost (30 min)'), findsOneWidget);
    expect(find.text('100 coins'), findsOneWidget);
  });

  testWidgets('activating a power-up shows a confirmation and updated balance', (tester) async {
    http.Request? purchaseRequest;
    final api = PowerUpsApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/power-ups/catalog') {
          return _jsonResponse(_catalogResponse, 200);
        }
        purchaseRequest = request;
        return _jsonResponse('{"coinBalance":100,"powerUpId":"boost"}', 201);
      }),
    );

    await tester.pumpWidget(MaterialApp(home: PowerUpsScreen(powerUpsApi: api)));
    await tester.pumpAndSettle();

    await tester.tap(find.widgetWithText(ElevatedButton, 'Activate'));
    await tester.pumpAndSettle();

    expect(purchaseRequest, isNotNull);
    expect(purchaseRequest!.body, '{"powerUpId":"boost"}');
    expect(find.text('Profile Boost (30 min) activated!'), findsOneWidget);
    expect(find.text('Coin balance: 100'), findsOneWidget);
  });

  testWidgets('purchasing a boost pack shows a "purchased" message, not "activated"', (tester) async {
    const boostPackCatalog =
        '[{"id":"boost-pack-3","label":"Boost Pack (3x 30 min)","coinCost":250}]';
    final api = PowerUpsApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/power-ups/catalog') {
          return _jsonResponse(boostPackCatalog, 200);
        }
        return _jsonResponse('{"coinBalance":50,"powerUpId":"boost-pack-3"}', 201);
      }),
    );

    await tester.pumpWidget(MaterialApp(home: PowerUpsScreen(powerUpsApi: api)));
    await tester.pumpAndSettle();

    await tester.tap(find.widgetWithText(ElevatedButton, 'Activate'));
    await tester.pumpAndSettle();

    expect(
      find.text('Boost Pack (3x 30 min) purchased! Use a credit whenever you want a boost.'),
      findsOneWidget,
    );
  });

  testWidgets('using a boost credit shows the remaining balance', (tester) async {
    http.Request? activateRequest;
    final api = PowerUpsApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/power-ups/catalog') {
          return _jsonResponse(_catalogResponse, 200);
        }
        activateRequest = request;
        return _jsonResponse('{"bonusBoosts":2,"expiresAt":"2026-01-01T00:30:00.000Z"}', 201);
      }),
    );

    await tester.pumpWidget(MaterialApp(home: PowerUpsScreen(powerUpsApi: api)));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Use a boost credit'));
    await tester.pumpAndSettle();

    expect(activateRequest, isNotNull);
    expect(activateRequest!.url.path, '/power-ups/activate-boost');
    expect(find.text('Boost activated! 2 credit(s) left.'), findsOneWidget);
  });

  testWidgets('shows an error when there are no boost credits to use', (tester) async {
    final api = PowerUpsApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/power-ups/catalog') {
          return _jsonResponse(_catalogResponse, 200);
        }
        return _jsonResponse(
          '{"message":"No boost credits available. Purchase a boost pack first."}',
          400,
        );
      }),
    );

    await tester.pumpWidget(MaterialApp(home: PowerUpsScreen(powerUpsApi: api)));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Use a boost credit'));
    await tester.pumpAndSettle();

    expect(find.text('No boost credits available. Purchase a boost pack first.'), findsOneWidget);
  });

  testWidgets('shows an error when the purchase fails', (tester) async {
    final api = PowerUpsApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/power-ups/catalog') {
          return _jsonResponse(_catalogResponse, 200);
        }
        return _jsonResponse('{"message":"Not enough coins for this power-up."}', 400);
      }),
    );

    await tester.pumpWidget(MaterialApp(home: PowerUpsScreen(powerUpsApi: api)));
    await tester.pumpAndSettle();

    await tester.tap(find.widgetWithText(ElevatedButton, 'Activate'));
    await tester.pumpAndSettle();

    expect(find.text('Not enough coins for this power-up.'), findsOneWidget);
  });
}
