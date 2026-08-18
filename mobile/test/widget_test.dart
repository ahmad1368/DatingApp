import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/testing.dart';
import 'package:http/http.dart' as http;

import 'package:mobile/auth/auth_api.dart';
import 'package:mobile/auth/phone_entry_screen.dart';

void main() {
  testWidgets('shows a validation error for an invalid phone number', (tester) async {
    final authApi = AuthApi(client: MockClient((request) async => http.Response('', 500)));

    await tester.pumpWidget(
      MaterialApp(
        home: PhoneEntryScreen(authApi: authApi, onVerified: (_) {}),
      ),
    );

    await tester.enterText(find.byType(TextFormField), '12345');
    await tester.tap(find.text('Send code'));
    await tester.pumpAndSettle();

    expect(
      find.text('Enter a valid international phone number (e.g. +14155552671)'),
      findsOneWidget,
    );
  });

  testWidgets('navigates to the OTP screen once a code is requested', (tester) async {
    final authApi = AuthApi(
      client: MockClient((request) async {
        expect(request.url.path, '/auth/otp/request');
        return http.Response(
          '{"expiresInSeconds":300,"resendCooldownSeconds":60}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: PhoneEntryScreen(authApi: authApi, onVerified: (_) {}),
      ),
    );

    await tester.enterText(find.byType(TextFormField), '+14155552671');
    await tester.tap(find.text('Send code'));
    await tester.pumpAndSettle();

    expect(find.text('Enter verification code'), findsOneWidget);
  });

  testWidgets('offers a Google sign-in option alongside phone auth', (tester) async {
    final authApi = AuthApi(client: MockClient((request) async => http.Response('', 500)));

    await tester.pumpWidget(
      MaterialApp(
        home: PhoneEntryScreen(authApi: authApi, onVerified: (_) {}),
      ),
    );

    expect(find.text('Continue with Google'), findsOneWidget);
  });
}
