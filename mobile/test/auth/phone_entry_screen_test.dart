import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/auth/auth_api.dart';
import 'package:mobile/auth/debug_login_defaults.dart';
import 'package:mobile/auth/phone_entry_screen.dart';

void main() {
  testWidgets(
    'debug builds pre-fill the phone field so pressing Send code alone works',
    (tester) async {
      String? requestedPhoneNumber;
      final api = AuthApi(
        client: MockClient((request) async {
          final body = jsonDecode(request.body) as Map<String, dynamic>;
          requestedPhoneNumber = body['phoneNumber'] as String;
          return http.Response(
            '{"expiresInSeconds":300,"resendCooldownSeconds":60}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      await tester.pumpWidget(
        MaterialApp(
          home: PhoneEntryScreen(authApi: api, onVerified: (_) {}),
        ),
      );

      final field = tester.widget<TextFormField>(find.byType(TextFormField));
      expect(field.controller!.text, debugTestPhoneNumber);

      await tester.tap(find.widgetWithText(ElevatedButton, 'Send code'));
      await tester.pumpAndSettle();

      expect(requestedPhoneNumber, debugTestPhoneNumber);
      expect(find.text('Enter verification code'), findsOneWidget);
    },
  );
}
