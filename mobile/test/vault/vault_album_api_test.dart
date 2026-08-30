import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/vault/vault_album_api.dart';

void main() {
  group('VaultAlbumApi.fetchMyAlbums', () {
    test('sends the bearer token and parses the albums', () async {
      final api = VaultAlbumApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.headers['Authorization'], 'Bearer a-jwt');
          expect(request.url.path, '/vault/albums');
          return http.Response(
            '[{"id":"album-1","name":"Beach Trip","createdAt":"2026-01-01T00:00:00.000Z",'
            '"photoIds":["photo-1"],"grantedMatchIds":["match-1"]}]',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final albums = await api.fetchMyAlbums();

      expect(albums, hasLength(1));
      expect(albums.first.name, 'Beach Trip');
      expect(albums.first.photoIds, ['photo-1']);
      expect(albums.first.grantedMatchIds, ['match-1']);
    });

    test('throws VaultAlbumApiException on a non-200 response', () async {
      final api = VaultAlbumApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async => http.Response('', 500)),
      );

      expect(() => api.fetchMyAlbums(), throwsA(isA<VaultAlbumApiException>()));
    });
  });

  group('VaultAlbumApi.createAlbum', () {
    test('sends the name and parses the created album', () async {
      final api = VaultAlbumApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.method, 'POST');
          expect(request.url.path, '/vault/albums');
          expect(request.body, '{"name":"Beach Trip"}');
          return http.Response(
            '{"id":"album-1","name":"Beach Trip","createdAt":"2026-01-01T00:00:00.000Z",'
            '"photoIds":[],"grantedMatchIds":[]}',
            201,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final album = await api.createAlbum('Beach Trip');

      expect(album.id, 'album-1');
    });

    test('throws VaultAlbumApiException when the album limit is reached', () async {
      final api = VaultAlbumApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => http.Response(
            '{"message":"You can only keep up to 10 vault albums."}',
            400,
            headers: {'content-type': 'application/json'},
          ),
        ),
      );

      expect(() => api.createAlbum('x'), throwsA(isA<VaultAlbumApiException>()));
    });
  });

  group('VaultAlbumApi.deleteAlbum', () {
    test('sends a DELETE to the album endpoint', () async {
      http.Request? deleteRequest;
      final api = VaultAlbumApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          deleteRequest = request;
          return http.Response('', 200);
        }),
      );

      await api.deleteAlbum('album-1');

      expect(deleteRequest, isNotNull);
      expect(deleteRequest!.method, 'DELETE');
      expect(deleteRequest!.url.path, '/vault/albums/album-1');
    });
  });

  group('VaultAlbumApi.grantAccess / revokeAccess', () {
    test('grantAccess sends the matchId', () async {
      http.Request? capturedRequest;
      final api = VaultAlbumApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          capturedRequest = request;
          return http.Response('', 200);
        }),
      );

      await api.grantAccess('album-1', 'match-1');

      expect(capturedRequest!.url.path, '/vault/albums/album-1/grant');
      expect(capturedRequest!.body, '{"matchId":"match-1"}');
    });

    test('revokeAccess sends the matchId', () async {
      http.Request? capturedRequest;
      final api = VaultAlbumApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          capturedRequest = request;
          return http.Response('', 200);
        }),
      );

      await api.revokeAccess('album-1', 'match-1');

      expect(capturedRequest!.url.path, '/vault/albums/album-1/revoke');
      expect(capturedRequest!.body, '{"matchId":"match-1"}');
    });
  });

  group('VaultAlbumApi.fetchGrantedAlbums', () {
    test('parses the granted albums and their photos for a match', () async {
      final api = VaultAlbumApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.url.path, '/vault/albums/matches/match-1');
          return http.Response(
            '[{"id":"album-1","name":"Beach Trip","grantedAt":"2026-01-02T00:00:00.000Z",'
            '"photos":[{"id":"photo-1","mediaUrl":"https://example.com/a.jpg"}]}]',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final albums = await api.fetchGrantedAlbums('match-1');

      expect(albums, hasLength(1));
      expect(albums.first.name, 'Beach Trip');
      expect(albums.first.photos, hasLength(1));
      expect(albums.first.photos.first.mediaUrl, 'https://example.com/a.jpg');
    });
  });
}
