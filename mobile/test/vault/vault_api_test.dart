import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/vault/vault_api.dart';

void main() {
  group('VaultApi.fetchMyPhotos', () {
    test('sends the bearer token and parses the photos', () async {
      final api = VaultApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.headers['Authorization'], 'Bearer a-jwt');
          expect(request.url.path, '/vault/photos');
          return http.Response(
            '[{"id":"photo-1","mediaUrl":"https://example.com/a.jpg",'
            '"createdAt":"2026-01-01T00:00:00.000Z","grantedMatchIds":["match-1"]}]',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final photos = await api.fetchMyPhotos();

      expect(photos, hasLength(1));
      expect(photos.first.grantedMatchIds, ['match-1']);
    });

    test('throws VaultApiException on a non-200 response', () async {
      final api = VaultApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async => http.Response('', 500)),
      );

      expect(() => api.fetchMyPhotos(), throwsA(isA<VaultApiException>()));
    });
  });

  group('VaultApi.addPhoto', () {
    test('sends the media URL and parses the created photo', () async {
      final api = VaultApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.method, 'POST');
          expect(request.url.path, '/vault/photos');
          expect(request.body, '{"mediaUrl":"https://example.com/a.jpg"}');
          return http.Response(
            '{"id":"photo-1","mediaUrl":"https://example.com/a.jpg",'
            '"createdAt":"2026-01-01T00:00:00.000Z","grantedMatchIds":[]}',
            201,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final photo = await api.addPhoto('https://example.com/a.jpg');

      expect(photo.id, 'photo-1');
    });

    test('throws VaultApiException when the vault is full', () async {
      final api = VaultApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => http.Response(
            '{"message":"You can only keep up to 20 vault photos."}',
            400,
            headers: {'content-type': 'application/json'},
          ),
        ),
      );

      expect(() => api.addPhoto('x'), throwsA(isA<VaultApiException>()));
    });
  });

  group('VaultApi.deletePhoto', () {
    test('sends a DELETE to the photo endpoint', () async {
      http.Request? deleteRequest;
      final api = VaultApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          deleteRequest = request;
          return http.Response('', 200);
        }),
      );

      await api.deletePhoto('photo-1');

      expect(deleteRequest, isNotNull);
      expect(deleteRequest!.method, 'DELETE');
      expect(deleteRequest!.url.path, '/vault/photos/photo-1');
    });
  });

  group('VaultApi.grantAccess / revokeAccess', () {
    test('grantAccess sends the matchId', () async {
      http.Request? capturedRequest;
      final api = VaultApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          capturedRequest = request;
          return http.Response('', 200);
        }),
      );

      await api.grantAccess('photo-1', 'match-1');

      expect(capturedRequest!.url.path, '/vault/photos/photo-1/grant');
      expect(capturedRequest!.body, '{"matchId":"match-1"}');
    });

    test('revokeAccess sends the matchId', () async {
      http.Request? capturedRequest;
      final api = VaultApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          capturedRequest = request;
          return http.Response('', 200);
        }),
      );

      await api.revokeAccess('photo-1', 'match-1');

      expect(capturedRequest!.url.path, '/vault/photos/photo-1/revoke');
      expect(capturedRequest!.body, '{"matchId":"match-1"}');
    });
  });

  group('VaultApi.fetchGrantedPhotos', () {
    test('parses the granted photos for a match', () async {
      final api = VaultApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.url.path, '/vault/matches/match-1');
          return http.Response(
            '[{"id":"photo-1","mediaUrl":"https://example.com/a.jpg",'
            '"grantedAt":"2026-01-02T00:00:00.000Z"}]',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final photos = await api.fetchGrantedPhotos('match-1');

      expect(photos, hasLength(1));
      expect(photos.first.mediaUrl, 'https://example.com/a.jpg');
    });
  });
}
