import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/safety/safety_api.dart';

void main() {
  group('SafetyApi.fetchResources', () {
    test('sends the bearer token and parses resources', () async {
      final api = SafetyApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.method, 'GET');
          expect(request.url.path, '/safety/resources');
          expect(request.headers['Authorization'], 'Bearer a-jwt');
          return http.Response(
            '[{"id":"meet-in-public","title":"Meet in a public place",'
            '"summary":"Choose a busy venue.","category":"FIRST_DATE"}]',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final resources = await api.fetchResources();

      expect(resources, hasLength(1));
      expect(resources.first.id, 'meet-in-public');
      expect(resources.first.category, 'FIRST_DATE');
    });

    test('throws SafetyApiException on a non-200 response', () async {
      final api = SafetyApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async => http.Response('', 500)),
      );

      expect(() => api.fetchResources(), throwsA(isA<SafetyApiException>()));
    });
  });

  group('SafetyApi.reportUser', () {
    test('sends a POST with the reason and optional details', () async {
      final api = SafetyApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.method, 'POST');
          expect(request.url.path, '/safety/reports');
          expect(
            request.body,
            '{"reportedUserId":"user-2","reason":"HARASSMENT","details":"Kept messaging."}',
          );
          return http.Response('{"id":"report-1"}', 201, headers: {'content-type': 'application/json'});
        }),
      );

      await api.reportUser(reportedUserId: 'user-2', reason: 'HARASSMENT', details: 'Kept messaging.');
    });

    test('omits details when not provided', () async {
      final api = SafetyApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.body, '{"reportedUserId":"user-2","reason":"OTHER"}');
          return http.Response('{"id":"report-1"}', 201, headers: {'content-type': 'application/json'});
        }),
      );

      await api.reportUser(reportedUserId: 'user-2', reason: 'OTHER');
    });

    test('throws SafetyApiException on a non-201 response', () async {
      final api = SafetyApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async => http.Response('', 400)),
      );

      expect(
        () => api.reportUser(reportedUserId: 'user-2', reason: 'OTHER'),
        throwsA(isA<SafetyApiException>()),
      );
    });
  });

  group('SafetyApi.createCheckIn', () {
    test('sends the scheduled time and parses the created check-in', () async {
      final scheduledAt = DateTime.utc(2026, 1, 1, 20, 0, 0);
      final api = SafetyApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.method, 'POST');
          expect(request.url.path, '/safety/check-ins');
          expect(
            request.body,
            '{"scheduledAt":"2026-01-01T20:00:00.000Z","location":"Cafe"}',
          );
          return http.Response(
            '{"id":"check-in-1","matchId":null,"location":"Cafe","scheduledAt":"2026-01-01T20:00:00.000Z",'
            '"emergencyContactName":null,"emergencyContactPhone":null,"notes":null,"confirmedAt":null,'
            '"status":"SCHEDULED"}',
            201,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final checkIn = await api.createCheckIn(scheduledAt: scheduledAt, location: 'Cafe');

      expect(checkIn.id, 'check-in-1');
      expect(checkIn.status, 'SCHEDULED');
      expect(checkIn.isOverdue, isFalse);
      expect(checkIn.isConfirmed, isFalse);
    });

    test('throws SafetyApiException when the scheduled time is invalid', () async {
      final api = SafetyApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => http.Response(
            '{"message":"Check-in time must be in the future."}',
            400,
            headers: {'content-type': 'application/json'},
          ),
        ),
      );

      expect(
        () => api.createCheckIn(scheduledAt: DateTime.now()),
        throwsA(isA<SafetyApiException>()),
      );
    });
  });

  group('SafetyApi.fetchCheckIns', () {
    test('parses a list of check-ins including overdue status', () async {
      final api = SafetyApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => http.Response(
            '[{"id":"check-in-1","matchId":null,"location":null,"scheduledAt":"2026-01-01T20:00:00.000Z",'
            '"emergencyContactName":null,"emergencyContactPhone":null,"notes":null,"confirmedAt":null,'
            '"status":"OVERDUE"}]',
            200,
            headers: {'content-type': 'application/json'},
          ),
        ),
      );

      final checkIns = await api.fetchCheckIns();

      expect(checkIns.first.isOverdue, isTrue);
    });
  });

  group('SafetyApi.confirmCheckIn', () {
    test('sends a PUT and parses the confirmed check-in', () async {
      final api = SafetyApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.method, 'PUT');
          expect(request.url.path, '/safety/check-ins/check-in-1/confirm');
          return http.Response(
            '{"id":"check-in-1","matchId":null,"location":null,"scheduledAt":"2026-01-01T20:00:00.000Z",'
            '"emergencyContactName":null,"emergencyContactPhone":null,"notes":null,'
            '"confirmedAt":"2026-01-01T19:55:00.000Z","status":"CONFIRMED"}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final checkIn = await api.confirmCheckIn('check-in-1');

      expect(checkIn.isConfirmed, isTrue);
    });
  });
}
