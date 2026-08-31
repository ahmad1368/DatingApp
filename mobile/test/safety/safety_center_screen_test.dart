import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/safety/safety_api.dart';
import 'package:mobile/safety/safety_center_screen.dart';

const _resourcesResponse = '[{"id":"meet-in-public","title":"Meet in a public place",'
    '"summary":"Choose a busy venue.","category":"FIRST_DATE"}]';

http.Response _jsonResponse(String body, int status) =>
    http.Response(body, status, headers: {'content-type': 'application/json'});

void main() {
  testWidgets('shows resources and an empty check-ins state', (tester) async {
    final api = SafetyApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/safety/resources') {
          return _jsonResponse(_resourcesResponse, 200);
        }
        return _jsonResponse('[]', 200);
      }),
    );

    await tester.pumpWidget(MaterialApp(home: SafetyCenterScreen(safetyApi: api)));
    await tester.pumpAndSettle();

    expect(find.text('Meet in a public place'), findsOneWidget);
    expect(find.text('No check-ins scheduled.'), findsOneWidget);
  });

  testWidgets('shows an existing check-in with its status', (tester) async {
    final api = SafetyApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/safety/resources') {
          return _jsonResponse('[]', 200);
        }
        if (request.url.path == '/safety/emergency-contacts') {
          return _jsonResponse('[]', 200);
        }
        return _jsonResponse(
          '[{"id":"check-in-1","matchId":null,"location":"Cafe","scheduledAt":"2026-01-01T20:00:00.000Z",'
          '"emergencyContactName":null,"emergencyContactPhone":null,"notes":null,"confirmedAt":null,'
          '"status":"SCHEDULED"}]',
          200,
        );
      }),
    );

    await tester.pumpWidget(MaterialApp(home: SafetyCenterScreen(safetyApi: api)));
    await tester.pumpAndSettle();

    expect(find.text('Cafe'), findsOneWidget);
    expect(find.text("I'm safe"), findsOneWidget);
  });

  testWidgets('confirming a check-in marks it safe', (tester) async {
    http.Request? confirmRequest;
    final api = SafetyApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/safety/resources') {
          return _jsonResponse('[]', 200);
        }
        if (request.method == 'PUT' && request.url.path.endsWith('/confirm')) {
          confirmRequest = request;
          return _jsonResponse(
            '{"id":"check-in-1","matchId":null,"location":"Cafe","scheduledAt":"2026-01-01T20:00:00.000Z",'
            '"emergencyContactName":null,"emergencyContactPhone":null,"notes":null,'
            '"confirmedAt":"2026-01-01T19:00:00.000Z","status":"CONFIRMED"}',
            200,
          );
        }
        if (request.url.path == '/safety/emergency-contacts') {
          return _jsonResponse('[]', 200);
        }
        return _jsonResponse(
          '[{"id":"check-in-1","matchId":null,"location":"Cafe","scheduledAt":"2026-01-01T20:00:00.000Z",'
          '"emergencyContactName":null,"emergencyContactPhone":null,"notes":null,"confirmedAt":null,'
          '"status":"SCHEDULED"}]',
          200,
        );
      }),
    );

    await tester.pumpWidget(MaterialApp(home: SafetyCenterScreen(safetyApi: api)));
    await tester.pumpAndSettle();

    await tester.tap(find.text("I'm safe"));
    await tester.pumpAndSettle();

    expect(confirmRequest, isNotNull);
    expect(find.text("You're marked safe."), findsOneWidget);
    expect(find.byIcon(Icons.check_circle), findsOneWidget);
  });

  testWidgets('scheduling a check-in submits the dialog and reloads', (tester) async {
    http.Request? createRequest;
    var checkInsCallCount = 0;
    final api = SafetyApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/safety/resources') {
          return _jsonResponse('[]', 200);
        }
        if (request.method == 'POST' && request.url.path == '/safety/check-ins') {
          createRequest = request;
          return _jsonResponse(
            '{"id":"check-in-1","matchId":null,"location":"Cafe","scheduledAt":"2026-01-01T20:00:00.000Z",'
            '"emergencyContactName":null,"emergencyContactPhone":null,"notes":null,"confirmedAt":null,'
            '"status":"SCHEDULED"}',
            201,
          );
        }
        checkInsCallCount += 1;
        return _jsonResponse('[]', 200);
      }),
    );

    await tester.pumpWidget(MaterialApp(home: SafetyCenterScreen(safetyApi: api)));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Schedule'));
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, 'Location (optional)'), 'Cafe');
    await tester.tap(find.text('Schedule').last);
    await tester.pumpAndSettle();

    expect(createRequest, isNotNull);
    expect(createRequest!.body, contains('"location":"Cafe"'));
    expect(find.text('Check-in scheduled.'), findsOneWidget);
    expect(checkInsCallCount, greaterThanOrEqualTo(2));
  });

  testWidgets('scheduling a check-in includes the emergency contact details', (tester) async {
    http.Request? createRequest;
    final api = SafetyApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/safety/resources') {
          return _jsonResponse('[]', 200);
        }
        if (request.method == 'POST' && request.url.path == '/safety/check-ins') {
          createRequest = request;
          return _jsonResponse(
            '{"id":"check-in-1","matchId":null,"location":null,"scheduledAt":"2026-01-01T20:00:00.000Z",'
            '"emergencyContactName":"Sam","emergencyContactPhone":"+15551234567","notes":null,'
            '"confirmedAt":null,"status":"SCHEDULED"}',
            201,
          );
        }
        return _jsonResponse('[]', 200);
      }),
    );

    await tester.pumpWidget(MaterialApp(home: SafetyCenterScreen(safetyApi: api)));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Schedule'));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.widgetWithText(TextField, 'Emergency contact name (optional)'),
      'Sam',
    );
    await tester.enterText(
      find.widgetWithText(TextField, 'Emergency contact phone (optional)'),
      '+15551234567',
    );
    await tester.tap(find.text('Schedule').last);
    await tester.pumpAndSettle();

    expect(createRequest, isNotNull);
    expect(createRequest!.body, contains('"emergencyContactName":"Sam"'));
    expect(createRequest!.body, contains('"emergencyContactPhone":"+15551234567"'));
  });

  testWidgets('shows when a missed check-in alerted the emergency contact', (tester) async {
    final api = SafetyApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/safety/resources') {
          return _jsonResponse('[]', 200);
        }
        if (request.url.path == '/safety/emergency-contacts') {
          return _jsonResponse('[]', 200);
        }
        return _jsonResponse(
          '[{"id":"check-in-1","matchId":null,"location":null,"scheduledAt":"2026-01-01T20:00:00.000Z",'
          '"emergencyContactName":"Sam","emergencyContactPhone":"+15551234567","notes":null,'
          '"confirmedAt":null,"status":"OVERDUE","alertSent":true}]',
          200,
        );
      }),
    );

    await tester.pumpWidget(MaterialApp(home: SafetyCenterScreen(safetyApi: api)));
    await tester.pumpAndSettle();

    expect(find.textContaining('contact alerted'), findsOneWidget);
  });

  testWidgets('reporting a user submits the dialog', (tester) async {
    http.Request? reportRequest;
    final api = SafetyApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/safety/resources') {
          return _jsonResponse('[]', 200);
        }
        if (request.method == 'POST' && request.url.path == '/safety/reports') {
          reportRequest = request;
          return _jsonResponse('{"id":"report-1"}', 201);
        }
        return _jsonResponse('[]', 200);
      }),
    );

    await tester.pumpWidget(MaterialApp(home: SafetyCenterScreen(safetyApi: api)));
    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(Icons.report_outlined));
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, 'User ID'), 'user-2');
    await tester.tap(find.text('Submit'));
    await tester.pumpAndSettle();

    expect(reportRequest, isNotNull);
    expect(reportRequest!.body, contains('"reportedUserId":"user-2"'));
    expect(find.text('Report submitted. Our team will review it.'), findsOneWidget);
  });

  testWidgets('shows existing emergency contacts and adds a new one', (tester) async {
    http.Request? addRequest;
    var contactsCallCount = 0;
    final api = SafetyApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/safety/resources') {
          return _jsonResponse('[]', 200);
        }
        if (request.method == 'POST' && request.url.path == '/safety/emergency-contacts') {
          addRequest = request;
          return _jsonResponse('{"id":"contact-2","name":"Jo","phone":"+15557654321"}', 201);
        }
        if (request.url.path == '/safety/emergency-contacts') {
          contactsCallCount += 1;
          return _jsonResponse('[{"id":"contact-1","name":"Sam","phone":"+15551234567"}]', 200);
        }
        return _jsonResponse('[]', 200);
      }),
    );

    await tester.pumpWidget(MaterialApp(home: SafetyCenterScreen(safetyApi: api)));
    await tester.pumpAndSettle();

    expect(find.text('Sam'), findsOneWidget);

    await tester.tap(find.text('Add'));
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, 'Name'), 'Jo');
    await tester.enterText(find.widgetWithText(TextField, 'Phone'), '+15557654321');
    await tester.tap(find.text('Add').last);
    await tester.pumpAndSettle();

    expect(addRequest, isNotNull);
    expect(addRequest!.body, '{"name":"Jo","phone":"+15557654321"}');
    expect(find.text('Jo'), findsOneWidget);
    expect(contactsCallCount, 1);
  });

  testWidgets('removing an emergency contact deletes it from the list', (tester) async {
    http.Request? deleteRequest;
    final api = SafetyApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/safety/resources') {
          return _jsonResponse('[]', 200);
        }
        if (request.method == 'DELETE') {
          deleteRequest = request;
          return http.Response('', 200);
        }
        if (request.url.path == '/safety/emergency-contacts') {
          return _jsonResponse('[{"id":"contact-1","name":"Sam","phone":"+15551234567"}]', 200);
        }
        return _jsonResponse('[]', 200);
      }),
    );

    await tester.pumpWidget(MaterialApp(home: SafetyCenterScreen(safetyApi: api)));
    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(Icons.delete));
    await tester.pumpAndSettle();

    expect(deleteRequest, isNotNull);
    expect(deleteRequest!.url.path, '/safety/emergency-contacts/contact-1');
    expect(find.text('Sam'), findsNothing);
  });

  testWidgets('tapping SOS sends the current location and shows a confirmation', (tester) async {
    http.Request? sosRequest;
    final api = SafetyApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/safety/resources') {
          return _jsonResponse('[]', 200);
        }
        if (request.method == 'POST' && request.url.path == '/safety/sos') {
          sosRequest = request;
          return _jsonResponse(
            '{"id":"alert-1","notifiedContactIds":["contact-1","contact-2"],'
            '"createdAt":"2026-01-01T00:00:00.000Z"}',
            201,
          );
        }
        return _jsonResponse('[]', 200);
      }),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SafetyCenterScreen(
          safetyApi: api,
          currentPositionProvider: () async => const Coordinates(latitude: 37.7749, longitude: -122.4194),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('SOS'));
    await tester.pumpAndSettle();

    expect(sosRequest, isNotNull);
    expect(sosRequest!.body, '{"latitude":37.7749,"longitude":-122.4194}');
    expect(find.text('SOS sent to 2 contact(s).'), findsOneWidget);
  });

  testWidgets('shows an error when triggering SOS fails', (tester) async {
    final api = SafetyApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/safety/resources') {
          return _jsonResponse('[]', 200);
        }
        if (request.method == 'POST' && request.url.path == '/safety/sos') {
          return _jsonResponse(
            '{"message":"Add at least one emergency contact before triggering SOS."}',
            400,
          );
        }
        return _jsonResponse('[]', 200);
      }),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SafetyCenterScreen(
          safetyApi: api,
          currentPositionProvider: () async => const Coordinates(latitude: 37.7749, longitude: -122.4194),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('SOS'));
    await tester.pumpAndSettle();

    expect(
      find.text('Add at least one emergency contact before triggering SOS.'),
      findsOneWidget,
    );
  });

  testWidgets('sharing live location sends the destination and current position', (tester) async {
    http.Request? shareRequest;
    final api = SafetyApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/safety/resources') {
          return _jsonResponse('[]', 200);
        }
        if (request.method == 'POST' && request.url.path == '/safety/date-location-share') {
          shareRequest = request;
          return _jsonResponse(
            '{"id":"share-1","notifiedContactIds":["contact-1"],'
            '"createdAt":"2026-01-01T00:00:00.000Z"}',
            201,
          );
        }
        return _jsonResponse('[]', 200);
      }),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SafetyCenterScreen(
          safetyApi: api,
          currentPositionProvider: () async => const Coordinates(latitude: 37.7749, longitude: -122.4194),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Share my live location'));
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField).first, '123 Main St');
    await tester.tap(find.text('Share'));
    await tester.pumpAndSettle();

    expect(shareRequest, isNotNull);
    expect(
      shareRequest!.body,
      '{"latitude":37.7749,"longitude":-122.4194,"destinationAddress":"123 Main St"}',
    );
    expect(find.text('Live location shared with 1 contact(s).'), findsOneWidget);
  });

  testWidgets('shows an error when sharing live location fails', (tester) async {
    final api = SafetyApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/safety/resources') {
          return _jsonResponse('[]', 200);
        }
        if (request.method == 'POST' && request.url.path == '/safety/date-location-share') {
          return _jsonResponse(
            '{"message":"Add at least one emergency contact before sharing your location."}',
            400,
          );
        }
        return _jsonResponse('[]', 200);
      }),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: SafetyCenterScreen(
          safetyApi: api,
          currentPositionProvider: () async => const Coordinates(latitude: 37.7749, longitude: -122.4194),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Share my live location'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Share'));
    await tester.pumpAndSettle();

    expect(
      find.text('Add at least one emergency contact before sharing your location.'),
      findsOneWidget,
    );
  });
}
