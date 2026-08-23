import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/safety/jwt_utils.dart';

String _fakeToken(Map<String, dynamic> payload) {
  String segment(Object value) =>
      base64Url.encode(utf8.encode(jsonEncode(value))).replaceAll('=', '');
  return '${segment({
        'alg': 'none',
      })}.${segment(payload)}.signature';
}

void main() {
  test('extracts the sub claim from a well-formed token', () {
    final token = _fakeToken({'sub': 'user-123'});

    expect(extractUserIdFromToken(token), 'user-123');
  });

  test('returns null for a token missing the sub claim', () {
    final token = _fakeToken({'other': 'value'});

    expect(extractUserIdFromToken(token), isNull);
  });

  test('returns null for a malformed token', () {
    expect(extractUserIdFromToken('not-a-jwt'), isNull);
  });

  test('returns null for garbage base64 in the payload segment', () {
    expect(extractUserIdFromToken('a.not-valid-base64!!!.c'), isNull);
  });
}
