import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/safety/watermark_overlay.dart';

String _fakeToken(Map<String, dynamic> payload) {
  String segment(Object value) =>
      base64Url.encode(utf8.encode(jsonEncode(value))).replaceAll('=', '');
  return '${segment({
        'alg': 'none',
      })}.${segment(payload)}.signature';
}

void main() {
  testWidgets('renders the child and tiles a watermark derived from the viewer id', (
    tester,
  ) async {
    final token = _fakeToken({'sub': 'user-abcdef123456'});

    await tester.pumpWidget(
      MaterialApp(
        home: WatermarkOverlay(accessToken: token, child: const Text('Profile content')),
      ),
    );

    expect(find.text('Profile content'), findsOneWidget);
    expect(find.text('user-abc'), findsWidgets);
  });

  testWidgets('renders only the child when the access token cannot be decoded', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: WatermarkOverlay(accessToken: 'not-a-jwt', child: const Text('Profile content')),
      ),
    );

    expect(find.text('Profile content'), findsOneWidget);
    expect(find.byType(GridView), findsNothing);
  });
}
