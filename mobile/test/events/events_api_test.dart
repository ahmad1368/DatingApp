import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/events/events_api.dart';

void main() {
  group('EventsApi.fetchNearbyEvents', () {
    test('sends the bearer token and parses events', () async {
      final api = EventsApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.headers['Authorization'], 'Bearer a-jwt');
          expect(request.url.path, '/events');
          return http.Response(
            '[{"id":"event-1","title":"Singles Mixer","description":null,'
            '"location":"Downtown Bar","category":"MIXER",'
            '"startsAt":"2026-02-01T18:00:00.000Z","distanceKm":2.5,'
            '"rsvpCount":3,"isRsvped":false,"checkedInCount":1,"isCheckedIn":false}]',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final events = await api.fetchNearbyEvents();

      expect(events, hasLength(1));
      expect(events.first.title, 'Singles Mixer');
      expect(events.first.distanceKm, 2.5);
      expect(events.first.checkedInCount, 1);
      expect(events.first.isCheckedIn, isFalse);
    });

    test('throws EventsApiException on a non-200 response', () async {
      final api = EventsApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async => http.Response('', 500)),
      );

      expect(() => api.fetchNearbyEvents(), throwsA(isA<EventsApiException>()));
    });
  });

  group('EventsApi.rsvp / cancelRsvp', () {
    test('rsvp posts to the rsvp endpoint', () async {
      http.Request? capturedRequest;
      final api = EventsApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          capturedRequest = request;
          return http.Response('', 200);
        }),
      );

      await api.rsvp('event-1');

      expect(capturedRequest!.method, 'POST');
      expect(capturedRequest!.url.path, '/events/event-1/rsvp');
    });

    test('cancelRsvp posts to the cancel-rsvp endpoint', () async {
      http.Request? capturedRequest;
      final api = EventsApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          capturedRequest = request;
          return http.Response('', 200);
        }),
      );

      await api.cancelRsvp('event-1');

      expect(capturedRequest!.method, 'POST');
      expect(capturedRequest!.url.path, '/events/event-1/cancel-rsvp');
    });

    test('throws EventsApiException on a non-200 response', () async {
      final api = EventsApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async => http.Response('{"message":"nope"}', 400)),
      );

      expect(() => api.rsvp('event-1'), throwsA(isA<EventsApiException>()));
    });
  });

  group('EventsApi.checkIn', () {
    test('posts to the check-in endpoint', () async {
      http.Request? capturedRequest;
      final api = EventsApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          capturedRequest = request;
          return http.Response('', 200);
        }),
      );

      await api.checkIn('event-1');

      expect(capturedRequest!.method, 'POST');
      expect(capturedRequest!.url.path, '/events/event-1/check-in');
    });

    test('throws EventsApiException when the event has not started yet', () async {
      final api = EventsApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async =>
              http.Response('{"message":"You can only check in once the event has started."}', 400),
        ),
      );

      expect(() => api.checkIn('event-1'), throwsA(isA<EventsApiException>()));
    });
  });
}
