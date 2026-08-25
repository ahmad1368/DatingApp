import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/work_verification/work_verification_api.dart';
import 'package:mobile/work_verification/work_verification_screen.dart';

http.Response _jsonResponse(String body, int status) =>
    http.Response(body, status, headers: {'content-type': 'application/json'});

const _unverifiedStatus =
    '{"jobTitle":null,"company":null,"school":null,"isWorkVerified":false,"isEducationVerified":false}';

void main() {
  testWidgets('requesting and confirming verification shows the verified badge', (tester) async {
    http.Request? requestBody;
    http.Request? confirmRequest;
    var statusCallCount = 0;
    final api = WorkVerificationApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.method == 'GET' && request.url.path == '/work-verification/status') {
          statusCallCount += 1;
          return _jsonResponse(_unverifiedStatus, 200);
        }
        if (request.url.path == '/work-verification/request') {
          requestBody = request;
          return _jsonResponse('{"expiresInSeconds":600,"resendCooldownSeconds":60}', 200);
        }
        if (request.url.path == '/work-verification/confirm') {
          confirmRequest = request;
          return _jsonResponse(
            '{"jobTitle":"Engineer","company":"Example Corp","school":null,'
            '"isWorkVerified":true,"isEducationVerified":false}',
            200,
          );
        }
        return _jsonResponse('{}', 200);
      }),
    );

    await tester.pumpWidget(MaterialApp(home: WorkVerificationScreen(workVerificationApi: api)));
    await tester.pumpAndSettle();

    expect(statusCallCount, 1);
    expect(find.byIcon(Icons.verified), findsNothing);

    await tester.enterText(find.widgetWithText(TextField, 'Job title'), 'Engineer');
    await tester.enterText(find.widgetWithText(TextField, 'Company'), 'Example Corp');
    await tester.enterText(find.widgetWithText(TextField, 'Work email'), 'ahmad@example-corp.com');

    await tester.tap(find.text('Send verification code'));
    await tester.pumpAndSettle();

    expect(requestBody, isNotNull);
    expect(
      requestBody!.body,
      '{"type":"WORK","email":"ahmad@example-corp.com","jobTitle":"Engineer","company":"Example Corp"}',
    );
    expect(find.text('Check your email for a verification code.'), findsOneWidget);
    expect(find.widgetWithText(TextField, 'Verification code'), findsOneWidget);

    await tester.enterText(find.widgetWithText(TextField, 'Verification code'), '123456');
    await tester.tap(find.text('Confirm'));
    await tester.pumpAndSettle();

    expect(confirmRequest, isNotNull);
    expect(confirmRequest!.body, '{"code":"123456"}');
    expect(find.byIcon(Icons.verified), findsOneWidget);
  });

  testWidgets('switching to Education shows the school field instead', (tester) async {
    final api = WorkVerificationApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.method == 'GET') {
          return _jsonResponse(_unverifiedStatus, 200);
        }
        return _jsonResponse('{}', 200);
      }),
    );

    await tester.pumpWidget(MaterialApp(home: WorkVerificationScreen(workVerificationApi: api)));
    await tester.pumpAndSettle();

    expect(find.widgetWithText(TextField, 'School'), findsNothing);

    await tester.tap(find.text('Education'));
    await tester.pumpAndSettle();

    expect(find.widgetWithText(TextField, 'School'), findsOneWidget);
    expect(find.widgetWithText(TextField, 'Job title'), findsNothing);
  });

  testWidgets('shows an error when requesting verification fails', (tester) async {
    final api = WorkVerificationApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.method == 'GET') {
          return _jsonResponse(_unverifiedStatus, 200);
        }
        return _jsonResponse('{"message":"boom"}', 400);
      }),
    );

    await tester.pumpWidget(MaterialApp(home: WorkVerificationScreen(workVerificationApi: api)));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Send verification code'));
    await tester.pumpAndSettle();

    expect(find.text('boom'), findsOneWidget);
  });
}
