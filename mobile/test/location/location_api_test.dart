import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/location/location_api.dart';

void main() {
  group('LocationApi.updateLocation', () {
    test('sends the bearer token and coordinates', () async {
      final api = LocationApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.method, 'PUT');
          expect(request.url.path, '/location');
          expect(request.headers['Authorization'], 'Bearer a-jwt');
          expect(request.body, '{"latitude":51.5,"longitude":-0.12}');
          return http.Response(
            '{"latitude":51.5,"longitude":-0.12,"locationUpdatedAt":"2026-01-01T00:00:00.000Z"}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      await api.updateLocation(latitude: 51.5, longitude: -0.12);
    });

    test('throws LocationApiException on a non-200 response', () async {
      final api = LocationApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => http.Response(
            '{"message":"latitude must be a latitude string or number"}',
            400,
            headers: {'content-type': 'application/json'},
          ),
        ),
      );

      expect(
        () => api.updateLocation(latitude: 999, longitude: 0),
        throwsA(isA<LocationApiException>()),
      );
    });
  });

  group('LocationApi.updateSearchRadius', () {
    test('sends the radius and parses the response', () async {
      final api = LocationApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.url.path, '/location/radius');
          expect(request.body, '{"radiusKm":25}');
          return http.Response(
            '{"searchRadiusKm":25}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final radius = await api.updateSearchRadius(25);

      expect(radius, 25);
    });
  });

  group('LocationApi.fetchRadiusSettings', () {
    test('parses the radius and auto-expand preference', () async {
      final api = LocationApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.method, 'GET');
          expect(request.url.path, '/location/radius');
          return http.Response(
            '{"searchRadiusKm":25,"autoExpandRadiusEnabled":true}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final settings = await api.fetchRadiusSettings();

      expect(settings.searchRadiusKm, 25);
      expect(settings.autoExpandRadiusEnabled, isTrue);
    });

    test('throws LocationApiException on a non-200 response', () async {
      final api = LocationApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async => http.Response('', 500)),
      );

      expect(() => api.fetchRadiusSettings(), throwsA(isA<LocationApiException>()));
    });
  });

  group('LocationApi.setAutoExpandRadius', () {
    test('sends the flag and parses the updated settings', () async {
      final api = LocationApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.method, 'PUT');
          expect(request.url.path, '/location/radius/auto-expand');
          expect(request.body, '{"enabled":false}');
          return http.Response(
            '{"searchRadiusKm":50,"autoExpandRadiusEnabled":false}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final settings = await api.setAutoExpandRadius(false);

      expect(settings.autoExpandRadiusEnabled, isFalse);
    });

    test('throws LocationApiException on a non-200 response', () async {
      final api = LocationApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async => http.Response('', 500)),
      );

      expect(() => api.setAutoExpandRadius(true), throwsA(isA<LocationApiException>()));
    });
  });

  group('LocationApi.fetchNearbyUsers', () {
    test('parses the list of nearby users', () async {
      final api = LocationApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.url.path, '/location/nearby');
          return http.Response(
            '[{"id":"user-2","name":"Jane","distanceKm":3.4}]',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final users = await api.fetchNearbyUsers();

      expect(users, hasLength(1));
      expect(users.first.id, 'user-2');
      expect(users.first.name, 'Jane');
      expect(users.first.distanceKm, 3.4);
    });

    test('throws LocationApiException when the backend rejects the request', () async {
      final api = LocationApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => http.Response(
            '{"message":"Set your location before searching nearby users."}',
            400,
            headers: {'content-type': 'application/json'},
          ),
        ),
      );

      expect(() => api.fetchNearbyUsers(), throwsA(isA<LocationApiException>()));
    });
  });

  group('LocationApi.fetchCrossedPaths', () {
    test('parses the list of crossed paths', () async {
      final api = LocationApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.url.path, '/location/crossed-paths');
          expect(request.headers['Authorization'], 'Bearer a-jwt');
          return http.Response(
            '[{"id":"user-2","name":"Jane","profilePhotoUrl":null,"crossCount":3,'
            '"closestDistanceKm":0.03,"lastCrossedAt":"2026-01-01T12:00:00.000Z"}]',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final crossedPaths = await api.fetchCrossedPaths();

      expect(crossedPaths, hasLength(1));
      expect(crossedPaths.first.id, 'user-2');
      expect(crossedPaths.first.crossCount, 3);
      expect(crossedPaths.first.closestDistanceKm, 0.03);
      expect(crossedPaths.first.lastCrossedAt, DateTime.parse('2026-01-01T12:00:00.000Z'));
    });

    test('throws LocationApiException on a non-200 response', () async {
      final api = LocationApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async => http.Response('', 500)),
      );

      expect(() => api.fetchCrossedPaths(), throwsA(isA<LocationApiException>()));
    });
  });
}
