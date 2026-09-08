import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/api_config.dart';

void main() {
  test('defaultApiBaseUrl falls back to the Android emulator alias', () {
    expect(defaultApiBaseUrl, 'http://10.0.2.2:3000');
  });
}
