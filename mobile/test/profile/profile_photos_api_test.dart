import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/profile/profile_photos_api.dart';

void main() {
  group('ProfilePhotosApi.fetchMyPhotos', () {
    test('sends the bearer token and parses the photos', () async {
      final api = ProfilePhotosApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.headers['Authorization'], 'Bearer a-jwt');
          expect(request.url.path, '/profile-photos');
          return http.Response(
            '[{"id":"photo-1","mediaUrl":"https://example.com/a.jpg","isLead":true,'
            '"impressions":10,"rightSwipes":4,"conversionRate":0.4}]',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final photos = await api.fetchMyPhotos();

      expect(photos, hasLength(1));
      expect(photos.first.isLead, isTrue);
      expect(photos.first.conversionRate, 0.4);
    });

    test('throws ProfilePhotosApiException on a non-200 response', () async {
      final api = ProfilePhotosApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async => http.Response('', 500)),
      );

      expect(() => api.fetchMyPhotos(), throwsA(isA<ProfilePhotosApiException>()));
    });
  });

  group('ProfilePhotosApi.addPhoto', () {
    test('sends the media URL and parses the created photo', () async {
      final api = ProfilePhotosApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.method, 'POST');
          expect(request.url.path, '/profile-photos');
          expect(request.body, '{"mediaUrl":"https://example.com/a.jpg"}');
          return http.Response(
            '{"id":"photo-1","mediaUrl":"https://example.com/a.jpg","isLead":true,'
            '"impressions":0,"rightSwipes":0,"conversionRate":null}',
            201,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final photo = await api.addPhoto('https://example.com/a.jpg');

      expect(photo.id, 'photo-1');
      expect(photo.conversionRate, isNull);
    });

    test('throws ProfilePhotosApiException when the gallery is full', () async {
      final api = ProfilePhotosApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => http.Response(
            '{"message":"You can only keep up to 9 profile photos."}',
            400,
            headers: {'content-type': 'application/json'},
          ),
        ),
      );

      expect(() => api.addPhoto('x'), throwsA(isA<ProfilePhotosApiException>()));
    });
  });

  group('ProfilePhotosApi.deletePhoto', () {
    test('sends a DELETE to the photo endpoint', () async {
      http.Request? deleteRequest;
      final api = ProfilePhotosApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          deleteRequest = request;
          return http.Response('', 200);
        }),
      );

      await api.deletePhoto('photo-1');

      expect(deleteRequest, isNotNull);
      expect(deleteRequest!.method, 'DELETE');
      expect(deleteRequest!.url.path, '/profile-photos/photo-1');
    });
  });
}
