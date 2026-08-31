import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/events/events_api.dart';

http.Response _jsonResponse(String body, int status) =>
    http.Response(body, status, headers: {'content-type': 'application/json'});

const _eventJson = '{"id":"event-1","title":"Singles Mixer","description":null,'
    '"location":"Downtown Bar","category":"MIXER","startsAt":"2026-02-01T18:00:00.000Z",'
    '"priceCoins":20,"distanceKm":null,"rsvpCount":0,"isRsvped":false,'
    '"checkedInCount":0,"isCheckedIn":false}';

void main() {
  group('EventsApi.fetchNearbyEvents', () {
    test('parses the event list including priceCoins', () async {
      final api = EventsApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.url.path, '/events');
          return _jsonResponse('[$_eventJson]', 200);
        }),
      );

      final events = await api.fetchNearbyEvents();

      expect(events, hasLength(1));
      expect(events.first.priceCoins, 20);
    });

    test('defaults priceCoins to 0 when omitted', () async {
      const freeEventJson = '{"id":"event-2","title":"Free Meetup","description":null,'
          '"location":"Park","category":"MEETUP","startsAt":"2026-02-01T18:00:00.000Z",'
          '"distanceKm":null,"rsvpCount":0,"isRsvped":false,"checkedInCount":0,"isCheckedIn":false}';
      final api = EventsApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async => _jsonResponse('[$freeEventJson]', 200)),
      );

      final events = await api.fetchNearbyEvents();

      expect(events.first.priceCoins, 0);
    });
  });

  group('EventsApi.rsvp', () {
    test('posts to the rsvp endpoint and returns the resulting coin balance', () async {
      final api = EventsApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.method, 'POST');
          expect(request.url.path, '/events/event-1/rsvp');
          return _jsonResponse('{"rsvped":true,"coinBalance":30}', 200);
        }),
      );

      expect(await api.rsvp('event-1'), 30);
    });

    test('throws EventsApiException when the coin balance is too low', () async {
      final api = EventsApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => _jsonResponse('{"message":"Not enough coins for this event access pass."}', 400),
        ),
      );

      expect(() => api.rsvp('event-1'), throwsA(isA<EventsApiException>()));
    });
  });

  group('EventsApi.cancelRsvp', () {
    test('posts to the cancel-rsvp endpoint and returns the refunded coin balance', () async {
      final api = EventsApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.method, 'POST');
          expect(request.url.path, '/events/event-1/cancel-rsvp');
          return _jsonResponse('{"cancelled":true,"coinBalance":50}', 200);
        }),
      );

      expect(await api.cancelRsvp('event-1'), 50);
    });
  });
}
