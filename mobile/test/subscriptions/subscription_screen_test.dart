import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/subscriptions/subscription_screen.dart';
import 'package:mobile/subscriptions/subscriptions_api.dart';

const _catalogResponse = '[{"tier":"FREE","label":"Free","priceUsdPerMonth":0,'
    '"features":["Standard swiping"]},'
    '{"tier":"PLUS","label":"Plus","priceUsdPerMonth":9.99,"features":["Unlimited likes"]}]';

void main() {
  testWidgets('shows the current plan and catalog', (tester) async {
    final api = SubscriptionsApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/subscriptions/catalog') {
          return http.Response(_catalogResponse, 200, headers: {'content-type': 'application/json'});
        }
        return http.Response(
          '{"tier":"FREE","isActive":false,"expiresAt":null,"canceledAt":null}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(MaterialApp(home: SubscriptionScreen(subscriptionsApi: api)));
    await tester.pump();
    await tester.pump();

    expect(find.text('Current plan: Free'), findsOneWidget);
    expect(find.textContaining('Plus - \$9.99/mo'), findsOneWidget);
    expect(find.text('Cancel subscription'), findsNothing);
  });

  testWidgets('subscribing to a tier updates the current plan', (tester) async {
    http.Request? subscribeRequest;
    final api = SubscriptionsApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/subscriptions/catalog') {
          return http.Response(_catalogResponse, 200, headers: {'content-type': 'application/json'});
        }
        if (request.method == 'POST' && request.url.path == '/subscriptions/subscribe') {
          subscribeRequest = request;
          return http.Response(
            '{"tier":"PLUS","isActive":true,"expiresAt":"2026-02-01T00:00:00.000Z","canceledAt":null}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response(
          '{"tier":"FREE","isActive":false,"expiresAt":null,"canceledAt":null}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(MaterialApp(home: SubscriptionScreen(subscriptionsApi: api)));
    await tester.pump();
    await tester.pump();

    await tester.tap(find.widgetWithText(ElevatedButton, 'Subscribe'));
    await tester.pump();
    await tester.pump();

    expect(subscribeRequest, isNotNull);
    expect(subscribeRequest!.body, '{"tier":"PLUS"}');
    expect(find.text('Current plan: PLUS'), findsOneWidget);
    expect(find.text('Cancel subscription'), findsOneWidget);
  });

  testWidgets('canceling reverts to the free plan', (tester) async {
    bool canceled = false;
    final api = SubscriptionsApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/subscriptions/catalog') {
          return http.Response(_catalogResponse, 200, headers: {'content-type': 'application/json'});
        }
        if (request.method == 'POST' && request.url.path == '/subscriptions/cancel') {
          canceled = true;
          return http.Response(
            '{"tier":"FREE","isActive":false,"expiresAt":null,"canceledAt":"2026-01-01T00:00:00.000Z"}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response(
          '{"tier":"GOLD","isActive":true,"expiresAt":"2026-02-01T00:00:00.000Z","canceledAt":null}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(MaterialApp(home: SubscriptionScreen(subscriptionsApi: api)));
    await tester.pump();
    await tester.pump();

    expect(find.text('Cancel subscription'), findsOneWidget);

    await tester.tap(find.text('Cancel subscription'));
    await tester.pump();
    await tester.pump();

    expect(canceled, isTrue);
    expect(find.text('Current plan: Free'), findsOneWidget);
  });
}
