import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/events/events_api.dart';
import 'package:mobile/events/events_screen.dart';

void main() {
  testWidgets('shows an empty state when there are no nearby events', (tester) async {
    final api = EventsApi(
      accessToken: 'a-jwt',
      client: MockClient(
        (request) async => http.Response('[]', 200, headers: {'content-type': 'application/json'}),
      ),
    );

    await tester.pumpWidget(MaterialApp(home: EventsScreen(eventsApi: api)));
    await tester.pumpAndSettle();

    expect(find.text('No upcoming events nearby yet.'), findsOneWidget);
  });

  testWidgets('lists events with location, distance, and RSVP button', (tester) async {
    final api = EventsApi(
      accessToken: 'a-jwt',
      client: MockClient(
        (request) async => http.Response(
          '[{"id":"event-1","title":"Singles Mixer","description":null,'
          '"location":"Downtown Bar","category":"MIXER",'
          '"startsAt":"2026-02-01T18:00:00.000Z","distanceKm":2.5,'
          '"rsvpCount":3,"isRsvped":false}]',
          200,
          headers: {'content-type': 'application/json'},
        ),
      ),
    );

    await tester.pumpWidget(MaterialApp(home: EventsScreen(eventsApi: api)));
    await tester.pumpAndSettle();

    expect(find.text('Singles Mixer'), findsOneWidget);
    expect(find.textContaining('Downtown Bar'), findsOneWidget);
    expect(find.textContaining('2.5 km away'), findsOneWidget);
    expect(find.text('RSVP'), findsOneWidget);
  });

  testWidgets('RSVPing then shows Cancel RSVP', (tester) async {
    http.Request? rsvpRequest;
    var rsvped = false;
    final api = EventsApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.method == 'POST' && request.url.path == '/events/event-1/rsvp') {
          rsvpRequest = request;
          rsvped = true;
          return http.Response('', 200);
        }
        return http.Response(
          '[{"id":"event-1","title":"Singles Mixer","description":null,'
          '"location":"Downtown Bar","category":"MIXER",'
          '"startsAt":"2026-02-01T18:00:00.000Z","distanceKm":null,'
          '"rsvpCount":${rsvped ? 1 : 0},"isRsvped":$rsvped}]',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(MaterialApp(home: EventsScreen(eventsApi: api)));
    await tester.pumpAndSettle();

    await tester.tap(find.text('RSVP'));
    await tester.pumpAndSettle();

    expect(rsvpRequest, isNotNull);
    expect(find.text('Cancel RSVP'), findsOneWidget);
  });
}
