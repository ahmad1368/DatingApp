import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/events/events_api.dart';
import 'package:mobile/events/events_screen.dart';

http.Response _jsonResponse(String body, int status) =>
    http.Response(body, status, headers: {'content-type': 'application/json'});

String _eventJson({int priceCoins = 0, bool isRsvped = false}) =>
    '{"id":"event-1","title":"Singles Mixer","description":null,'
    '"location":"Downtown Bar","category":"MIXER","startsAt":"2026-02-01T18:00:00.000Z",'
    '"priceCoins":$priceCoins,"distanceKm":null,"rsvpCount":0,"isRsvped":$isRsvped,'
    '"checkedInCount":0,"isCheckedIn":false}';

void main() {
  testWidgets('shows the access-pass price on a paid event\'s RSVP button', (tester) async {
    final api = EventsApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async => _jsonResponse('[${_eventJson(priceCoins: 20)}]', 200)),
    );

    await tester.pumpWidget(MaterialApp(home: EventsScreen(eventsApi: api)));
    await tester.pumpAndSettle();

    expect(find.text('RSVP (20 coins)'), findsOneWidget);
    expect(find.textContaining('20 coins'), findsWidgets);
  });

  testWidgets('shows "Free" for a free event and a plain RSVP button', (tester) async {
    final api = EventsApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async => _jsonResponse('[${_eventJson()}]', 200)),
    );

    await tester.pumpWidget(MaterialApp(home: EventsScreen(eventsApi: api)));
    await tester.pumpAndSettle();

    expect(find.text('RSVP'), findsOneWidget);
    expect(find.textContaining('Free'), findsOneWidget);
  });

  testWidgets('rsvping to a paid event updates and shows the resulting coin balance', (tester) async {
    http.Request? rsvpRequest;
    var alreadyRsvped = false;
    final api = EventsApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.method == 'POST') {
          rsvpRequest = request;
          alreadyRsvped = true;
          return _jsonResponse('{"rsvped":true,"coinBalance":30}', 200);
        }
        return _jsonResponse('[${_eventJson(priceCoins: 20, isRsvped: alreadyRsvped)}]', 200);
      }),
    );

    await tester.pumpWidget(MaterialApp(home: EventsScreen(eventsApi: api)));
    await tester.pumpAndSettle();

    await tester.tap(find.widgetWithText(ElevatedButton, 'RSVP (20 coins)'));
    await tester.pumpAndSettle();

    expect(rsvpRequest, isNotNull);
    expect(rsvpRequest!.url.path, '/events/event-1/rsvp');
    expect(find.text('30 coins'), findsOneWidget);
    expect(find.widgetWithText(ElevatedButton, 'Cancel RSVP'), findsOneWidget);
  });

  testWidgets('shows an error when the coin balance is too low', (tester) async {
    final api = EventsApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.method == 'POST') {
          return _jsonResponse('{"message":"Not enough coins for this event access pass."}', 400);
        }
        return _jsonResponse('[${_eventJson(priceCoins: 20)}]', 200);
      }),
    );

    await tester.pumpWidget(MaterialApp(home: EventsScreen(eventsApi: api)));
    await tester.pumpAndSettle();

    await tester.tap(find.widgetWithText(ElevatedButton, 'RSVP (20 coins)'));
    await tester.pumpAndSettle();

    expect(find.text('Not enough coins for this event access pass.'), findsOneWidget);
  });
}
