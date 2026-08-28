import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/vetting/vetting_api.dart';
import 'package:mobile/vetting/vetting_application_screen.dart';

http.Response _jsonResponse(String body, int status) =>
    http.Response(body, status, headers: {'content-type': 'application/json'});

void main() {
  testWidgets('shows the apply form when the user has not applied yet', (tester) async {
    final api = VettingApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async => http.Response('', 404)),
    );

    await tester.pumpWidget(MaterialApp(home: VettingApplicationScreen(vettingApi: api)));
    await tester.pumpAndSettle();

    expect(find.text('Submit application'), findsOneWidget);
  });

  testWidgets('submitting the apply form shows the resulting pending status', (tester) async {
    http.Request? applyRequest;
    final api = VettingApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.method == 'POST' && request.url.path == '/vetting/apply') {
          applyRequest = request;
          return _jsonResponse(
            '{"id":"app-1","userId":"user-1","status":"PENDING","referralCount":0,'
            '"socialLinks":["https://instagram.com/me"],"decisionReason":null,'
            '"createdAt":"2026-01-01T00:00:00.000Z","decidedAt":null}',
            201,
          );
        }
        return http.Response('', 404);
      }),
    );

    await tester.pumpWidget(MaterialApp(home: VettingApplicationScreen(vettingApi: api)));
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField).first, 'https://instagram.com/me');
    await tester.tap(find.text('Submit application'));
    await tester.pumpAndSettle();

    expect(applyRequest, isNotNull);
    expect(find.text('Status: PENDING'), findsOneWidget);
    expect(find.text('Peer referrals: 0'), findsOneWidget);
  });

  testWidgets('a pending applicant can redeem a referral code', (tester) async {
    http.Request? redeemRequest;
    final api = VettingApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.method == 'POST' && request.url.path == '/vetting/referral-code/redeem') {
          redeemRequest = request;
          return _jsonResponse(
            '{"id":"app-1","userId":"user-1","status":"PENDING","referralCount":1,'
            '"socialLinks":[],"decisionReason":null,"createdAt":"2026-01-01T00:00:00.000Z",'
            '"decidedAt":null}',
            200,
          );
        }
        return _jsonResponse(
          '{"id":"app-1","userId":"user-1","status":"PENDING","referralCount":0,'
          '"socialLinks":[],"decisionReason":null,"createdAt":"2026-01-01T00:00:00.000Z",'
          '"decidedAt":null}',
          200,
        );
      }),
    );

    await tester.pumpWidget(MaterialApp(home: VettingApplicationScreen(vettingApi: api)));
    await tester.pumpAndSettle();

    await tester.enterText(find.widgetWithText(TextField, 'Referral code'), 'ABCD1234');
    await tester.tap(find.text('Redeem code'));
    await tester.pumpAndSettle();

    expect(redeemRequest, isNotNull);
    expect(redeemRequest!.body, '{"code":"ABCD1234"}');
    expect(find.text('Peer referrals: 1'), findsOneWidget);
  });

  testWidgets('an approved member can fetch their referral code and refer someone', (tester) async {
    http.Request? referRequest;
    final api = VettingApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/vetting/referral-code') {
          return _jsonResponse('{"referralCode":"WXYZ9876"}', 200);
        }
        if (request.method == 'POST' && request.url.path == '/vetting/referrals') {
          referRequest = request;
          return _jsonResponse(
            '{"id":"app-2","userId":"user-2","status":"PENDING","referralCount":1,'
            '"socialLinks":[],"decisionReason":null,"createdAt":"2026-01-01T00:00:00.000Z",'
            '"decidedAt":null}',
            200,
          );
        }
        return _jsonResponse(
          '{"id":"app-1","userId":"user-1","status":"APPROVED","referralCount":2,'
          '"socialLinks":[],"decisionReason":null,"createdAt":"2026-01-01T00:00:00.000Z",'
          '"decidedAt":"2026-01-02T00:00:00.000Z"}',
          200,
        );
      }),
    );

    await tester.pumpWidget(MaterialApp(home: VettingApplicationScreen(vettingApi: api)));
    await tester.pumpAndSettle();

    expect(find.text("You're a member!"), findsOneWidget);

    await tester.tap(find.text('Get my referral code'));
    await tester.pumpAndSettle();

    expect(find.text('Your referral code: WXYZ9876'), findsOneWidget);

    await tester.enterText(find.widgetWithText(TextField, "Applicant's user id"), 'applicant-1');
    await tester.tap(find.text('Refer'));
    await tester.pumpAndSettle();

    expect(referRequest, isNotNull);
    expect(referRequest!.body, '{"applicantUserId":"applicant-1"}');
    expect(find.text('Referral sent.'), findsOneWidget);
  });
}
