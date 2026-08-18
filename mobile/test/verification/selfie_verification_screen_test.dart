import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/verification/selfie_verification_screen.dart';
import 'package:mobile/verification/verification_api.dart';

void main() {
  testWidgets('requesting a challenge shows the gesture instruction', (tester) async {
    final api = VerificationApi(
      accessToken: 'a-jwt',
      client: MockClient(
        (request) async => http.Response(
          '{"challengeId":"challenge-1","gesture":"SMILE","expiresInSeconds":120}',
          200,
          headers: {'content-type': 'application/json'},
        ),
      ),
    );

    await tester.pumpWidget(
      MaterialApp(home: SelfieVerificationScreen(verificationApi: api)),
    );

    expect(find.text('Start verification'), findsOneWidget);

    await tester.tap(find.text('Start verification'));
    await tester.pumpAndSettle();

    expect(find.text('Smile for the camera'), findsOneWidget);
    expect(find.text('Take selfie'), findsOneWidget);
  });

  testWidgets('shows an error when the challenge request fails', (tester) async {
    final api = VerificationApi(
      accessToken: 'a-jwt',
      client: MockClient(
        (request) async => http.Response(
          '{"message":"Missing authentication token."}',
          401,
          headers: {'content-type': 'application/json'},
        ),
      ),
    );

    await tester.pumpWidget(
      MaterialApp(home: SelfieVerificationScreen(verificationApi: api)),
    );

    await tester.tap(find.text('Start verification'));
    await tester.pumpAndSettle();

    expect(find.text('Missing authentication token.'), findsOneWidget);
  });
}
