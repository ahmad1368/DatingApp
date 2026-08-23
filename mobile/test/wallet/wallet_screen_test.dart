import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/wallet/wallet_api.dart';
import 'package:mobile/wallet/wallet_screen.dart';

http.Response _jsonResponse(String body, int status) =>
    http.Response(body, status, headers: {'content-type': 'application/json'});

const _catalogResponse =
    '[{"id":"starter","coinAmount":100,"priceUsdCents":199,"label":"100 coins"}]';

void main() {
  testWidgets('shows the balance, catalog, and empty purchase history', (tester) async {
    final api = WalletApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/wallet/catalog') {
          return _jsonResponse(_catalogResponse, 200);
        }
        if (request.url.path == '/wallet/balance') {
          return _jsonResponse('{"coinBalance":100}', 200);
        }
        return _jsonResponse('[]', 200);
      }),
    );

    await tester.pumpWidget(MaterialApp(home: WalletScreen(walletApi: api)));
    await tester.pumpAndSettle();

    expect(find.text('Coin balance: 100'), findsOneWidget);
    expect(find.text('100 coins'), findsOneWidget);
    expect(find.text('\$1.99'), findsOneWidget);
    expect(find.text('No purchases yet.'), findsOneWidget);
  });

  testWidgets('buying a package updates the balance and purchase history', (tester) async {
    var purchasesCallCount = 0;
    http.Request? purchaseRequest;
    final api = WalletApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/wallet/catalog') {
          return _jsonResponse(_catalogResponse, 200);
        }
        if (request.url.path == '/wallet/balance') {
          return _jsonResponse('{"coinBalance":100}', 200);
        }
        if (request.method == 'POST' && request.url.path == '/wallet/purchase') {
          purchaseRequest = request;
          return _jsonResponse('{"coinBalance":200,"purchase":{}}', 201);
        }
        if (request.url.path == '/wallet/purchases') {
          purchasesCallCount += 1;
          if (purchasesCallCount == 1) {
            return _jsonResponse('[]', 200);
          }
          return _jsonResponse(
            '[{"id":"purchase-1","coinPackage":{"id":"starter","coinAmount":100,'
            '"priceUsdCents":199,"label":"100 coins"},"createdAt":"2026-01-01T00:00:00.000Z"}]',
            200,
          );
        }
        return _jsonResponse('[]', 200);
      }),
    );

    await tester.pumpWidget(MaterialApp(home: WalletScreen(walletApi: api)));
    await tester.pumpAndSettle();

    await tester.tap(find.widgetWithText(ElevatedButton, 'Buy'));
    await tester.pumpAndSettle();

    expect(purchaseRequest, isNotNull);
    expect(purchaseRequest!.body, '{"packageId":"starter"}');
    expect(find.text('Coin balance: 200'), findsOneWidget);
    expect(find.text('Purchased 100 coins!'), findsOneWidget);
  });
}
