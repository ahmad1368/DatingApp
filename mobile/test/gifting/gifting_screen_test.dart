import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/gifting/gifting_api.dart';
import 'package:mobile/gifting/gifting_screen.dart';

http.Response _jsonResponse(String body, int status) =>
    http.Response(body, status, headers: {'content-type': 'application/json'});

const _catalogResponse = '[{"id":"rose","name":"Rose","emoji":"🌹","tokenCost":10}]';

void main() {
  testWidgets('shows the balance and empty states', (tester) async {
    final api = GiftingApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/gifting/catalog') {
          return _jsonResponse(_catalogResponse, 200);
        }
        if (request.url.path == '/gifting/balance') {
          return _jsonResponse('{"tokenBalance":100}', 200);
        }
        return _jsonResponse('[]', 200);
      }),
    );

    await tester.pumpWidget(MaterialApp(home: GiftingScreen(giftingApi: api)));
    await tester.pumpAndSettle();

    expect(find.text('Token balance: 100'), findsOneWidget);
    expect(find.text('No gifts received yet.'), findsOneWidget);
    expect(find.text('No gifts sent yet.'), findsOneWidget);
  });

  testWidgets('shows an error when no recipient is entered', (tester) async {
    final api = GiftingApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/gifting/catalog') {
          return _jsonResponse(_catalogResponse, 200);
        }
        if (request.url.path == '/gifting/balance') {
          return _jsonResponse('{"tokenBalance":100}', 200);
        }
        return _jsonResponse('[]', 200);
      }),
    );

    await tester.pumpWidget(MaterialApp(home: GiftingScreen(giftingApi: api)));
    await tester.pumpAndSettle();

    await tester.tap(find.widgetWithText(ActionChip, 'Rose (10)'));
    await tester.pumpAndSettle();

    expect(find.text('Enter who you want to send this to first.'), findsOneWidget);
  });

  testWidgets('sending a gift updates the balance and sent history', (tester) async {
    http.Request? sendRequest;
    var sentCallCount = 0;
    final api = GiftingApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/gifting/catalog') {
          return _jsonResponse(_catalogResponse, 200);
        }
        if (request.url.path == '/gifting/balance') {
          return _jsonResponse('{"tokenBalance":100}', 200);
        }
        if (request.method == 'POST' && request.url.path == '/gifting/send') {
          sendRequest = request;
          return _jsonResponse(
            '{"tokenBalance":90,"transaction":{"id":"gift-1",'
            '"gift":{"id":"rose","name":"Rose","emoji":"🌹","tokenCost":10},'
            '"message":null,"createdAt":"2026-01-01T00:00:00.000Z",'
            '"otherUserId":"user-2","otherUserName":"Alex","otherUserPhotoUrl":null}}',
            201,
          );
        }
        if (request.url.path == '/gifting/sent') {
          sentCallCount += 1;
          if (sentCallCount == 1) {
            return _jsonResponse('[]', 200);
          }
          return _jsonResponse(
            '[{"id":"gift-1","gift":{"id":"rose","name":"Rose","emoji":"🌹","tokenCost":10},'
            '"message":null,"createdAt":"2026-01-01T00:00:00.000Z",'
            '"otherUserId":"user-2","otherUserName":"Alex","otherUserPhotoUrl":null}]',
            200,
          );
        }
        return _jsonResponse('[]', 200);
      }),
    );

    await tester.pumpWidget(MaterialApp(home: GiftingScreen(giftingApi: api)));
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField), 'user-2');
    await tester.tap(find.widgetWithText(ActionChip, 'Rose (10)'));
    await tester.pumpAndSettle();

    expect(sendRequest, isNotNull);
    expect(sendRequest!.body, '{"recipientId":"user-2","giftId":"rose"}');
    expect(find.text('Token balance: 90'), findsOneWidget);
    expect(find.text('Sent 🌹 Rose!'), findsOneWidget);
    expect(find.text('Rose to Alex'), findsOneWidget);
  });
}
