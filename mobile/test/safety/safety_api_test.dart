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

    test('parses alertSent when the backend includes it', () async {
      final api = SafetyApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => http.Response(
            '[{"id":"check-in-1","matchId":null,"location":null,"scheduledAt":"2026-01-01T20:00:00.000Z",'
            '"emergencyContactName":"Sam","emergencyContactPhone":"+15551234567","notes":null,'
            '"confirmedAt":null,"status":"OVERDUE","alertSent":true}]',
            200,
            headers: {'content-type': 'application/json'},
          ),
        ),
      );

      final checkIns = await api.fetchCheckIns();

      expect(checkIns.first.alertSent, isTrue);
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

  group('SafetyApi.fetchEmergencyContacts', () {
    test('sends the bearer token and parses the contacts', () async {
      final api = SafetyApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.headers['Authorization'], 'Bearer a-jwt');
          expect(request.url.path, '/safety/emergency-contacts');
          return http.Response(
            '[{"id":"contact-1","name":"Sam","phone":"+15551234567"}]',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final contacts = await api.fetchEmergencyContacts();

      expect(contacts, hasLength(1));
      expect(contacts.first.name, 'Sam');
      expect(contacts.first.phone, '+15551234567');
    });

    test('throws SafetyApiException on a non-200 response', () async {
      final api = SafetyApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async => http.Response('', 500)),
      );

      expect(() => api.fetchEmergencyContacts(), throwsA(isA<SafetyApiException>()));
    });
  });

  group('SafetyApi.addEmergencyContact', () {
    test('sends the name and phone, parsing the created contact', () async {
      final api = SafetyApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.method, 'POST');
          expect(request.url.path, '/safety/emergency-contacts');
          expect(request.body, '{"name":"Sam","phone":"+15551234567"}');
          return http.Response(
            '{"id":"contact-1","name":"Sam","phone":"+15551234567"}',
            201,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final contact = await api.addEmergencyContact(name: 'Sam', phone: '+15551234567');

      expect(contact.id, 'contact-1');
    });
  });

  group('SafetyApi.deleteEmergencyContact', () {
    test('sends a DELETE to the contact endpoint', () async {
      http.Request? deleteRequest;
      final api = SafetyApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          deleteRequest = request;
          return http.Response('', 200);
        }),
      );

      await api.deleteEmergencyContact('contact-1');

      expect(deleteRequest, isNotNull);
      expect(deleteRequest!.method, 'DELETE');
      expect(deleteRequest!.url.path, '/safety/emergency-contacts/contact-1');
    });
  });

  group('SafetyApi.triggerSos', () {
    test('sends the coordinates and parses the alert result', () async {
      final api = SafetyApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.method, 'POST');
          expect(request.url.path, '/safety/sos');
          expect(request.body, '{"latitude":37.7749,"longitude":-122.4194}');
          return http.Response(
            '{"id":"alert-1","notifiedContactIds":["contact-1"],'
            '"createdAt":"2026-01-01T00:00:00.000Z"}',
            201,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final result = await api.triggerSos(latitude: 37.7749, longitude: -122.4194);

      expect(result.id, 'alert-1');
      expect(result.notifiedContactIds, ['contact-1']);
    });

    test('throws SafetyApiException when there are no emergency contacts', () async {
      final api = SafetyApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => http.Response(
            '{"message":"Add at least one emergency contact before triggering SOS."}',
            400,
            headers: {'content-type': 'application/json'},
          ),
        ),
      );

      expect(
        () => api.triggerSos(latitude: 37.7749, longitude: -122.4194),
        throwsA(isA<SafetyApiException>()),
      );
    });
  });

  group('SafetyApi.shareDateLocation', () {
    test('sends the coordinates and destination, parsing the share result', () async {
      final api = SafetyApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.method, 'POST');
          expect(request.url.path, '/safety/date-location-share');
          expect(
            request.body,
            '{"latitude":37.7749,"longitude":-122.4194,"destinationAddress":"123 Main St"}',
          );
          return http.Response(
            '{"id":"share-1","notifiedContactIds":["contact-1"],'
            '"createdAt":"2026-01-01T00:00:00.000Z"}',
            201,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final result = await api.shareDateLocation(
        latitude: 37.7749,
        longitude: -122.4194,
        destinationAddress: '123 Main St',
      );

      expect(result.id, 'share-1');
      expect(result.notifiedContactIds, ['contact-1']);
    });

    test('throws SafetyApiException when there are no emergency contacts', () async {
      final api = SafetyApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => http.Response(
            '{"message":"Add at least one emergency contact before sharing your location."}',
            400,
            headers: {'content-type': 'application/json'},
          ),
        ),
      );

      expect(
        () => api.shareDateLocation(latitude: 37.7749, longitude: -122.4194),
        throwsA(isA<SafetyApiException>()),
      );
    });
  });
}
