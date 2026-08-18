import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/location/passport_api.dart';

void main() {
  group('PassportApi.setPassportLocation', () {
    test('sends the bearer token and coordinates, and parses the result', () async {
      final api = PassportApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.method, 'PUT');
          expect(request.url.path, '/location/passport');
          expect(request.headers['Authorization'], 'Bearer a-jwt');
          expect(request.body, '{"latitude":48.8566,"longitude":2.3522}');
          return http.Response(
            '{"passportEnabled":true,"latitude":48.8566,"longitude":2.3522}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final result = await api.setPassportLocation(latitude: 48.8566, longitude: 2.3522);

      expect(result.passportEnabled, isTrue);
      expect(result.latitude, 48.8566);
    });

    test('throws PassportApiException for non-premium users', () async {
      final api = PassportApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => http.Response(
            '{"message":"Passport is a premium feature. Upgrade to use it."}',
            403,
            headers: {'content-type': 'application/json'},
          ),
        ),
      );

      expect(
        () => api.setPassportLocation(latitude: 0, longitude: 0),
        throwsA(isA<PassportApiException>()),
      );
    });
  });

  group('PassportApi.clearPassportLocation', () {
    test('sends a DELETE request and parses the disabled result', () async {
      final api = PassportApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.method, 'DELETE');
          expect(request.url.path, '/location/passport');
          return http.Response(
            '{"passportEnabled":false,"latitude":48.8566,"longitude":2.3522}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final result = await api.clearPassportLocation();

      expect(result.passportEnabled, isFalse);
    });
  });
}
