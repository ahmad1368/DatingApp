import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/discovery/profile_visits_api.dart';

void main() {
  group('ProfileVisitsApi.recordVisit', () {
    test('sends the bearer token and anonymous flag', () async {
      final api = ProfileVisitsApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.headers['Authorization'], 'Bearer a-jwt');
          expect(request.method, 'POST');
          expect(request.url.path, '/profile-visits/user-2');
          expect(request.body, '{"anonymous":true}');
          return http.Response('', 201);
        }),
      );

      await api.recordVisit('user-2', anonymous: true);
    });

    test('defaults anonymous to false', () async {
      final api = ProfileVisitsApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.body, '{"anonymous":false}');
          return http.Response('', 201);
        }),
      );

      await api.recordVisit('user-2');
    });

    test('throws ProfileVisitsApiException when anonymous browsing requires premium', () async {
      final api = ProfileVisitsApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => http.Response(
            '{"message":"Browsing anonymously is a premium feature."}',
            403,
            headers: {'content-type': 'application/json'},
          ),
        ),
      );

      expect(
        () => api.recordVisit('user-2', anonymous: true),
        throwsA(isA<ProfileVisitsApiException>()),
      );
    });
  });

  group('ProfileVisitsApi.fetchVisitors', () {
    test('parses the visitor list', () async {
      final api = ProfileVisitsApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => http.Response(
            '[{"visitorId":"user-3","visitorName":"Sam","visitorPhotoUrl":"sam.jpg",'
            '"visitedAt":"2026-01-01T00:00:00.000Z"}]',
            200,
            headers: {'content-type': 'application/json'},
          ),
        ),
      );

      final visitors = await api.fetchVisitors();

      expect(visitors, hasLength(1));
      expect(visitors.first.visitorName, 'Sam');
    });

    test('throws ProfileVisitsApiException when the user is not premium', () async {
      final api = ProfileVisitsApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => http.Response(
            '{"message":"Seeing your profile visitors is a premium feature."}',
            403,
            headers: {'content-type': 'application/json'},
          ),
        ),
      );

      expect(() => api.fetchVisitors(), throwsA(isA<ProfileVisitsApiException>()));
    });
  });
}
