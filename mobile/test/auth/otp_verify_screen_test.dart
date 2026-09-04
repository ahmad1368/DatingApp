import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/auth/auth_api.dart';
import 'package:mobile/auth/debug_login_defaults.dart';
import 'package:mobile/auth/otp_verify_screen.dart';

void main() {
  testWidgets(
    'debug builds pre-fill the OTP field so pressing Verify alone signs in',
    (tester) async {
      String? verifiedCode;
      AuthResult? result;
      final api = AuthApi(
        client: MockClient((request) async {
          final body = jsonDecode(request.body) as Map<String, dynamic>;
          verifiedCode = body['code'] as String;
          return http.Response(
            '{"accessToken":"a-jwt","user":{"id":"u1","phoneNumber":"$debugTestPhoneNumber"}}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      await tester.pumpWidget(
        MaterialApp(
          home: OtpVerifyScreen(
            phoneNumber: debugTestPhoneNumber,
            authApi: api,
            onVerified: (r) => result = r,
          ),
        ),
      );

      final field = tester.widget<TextFormField>(find.byType(TextFormField));
      expect(field.controller!.text, debugTestOtpCode);

      await tester.tap(find.widgetWithText(ElevatedButton, 'Verify'));
      await tester.pumpAndSettle();

      expect(verifiedCode, debugTestOtpCode);
      expect(result?.accessToken, 'a-jwt');
    },
  );
}
