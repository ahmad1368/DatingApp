import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/profile/avatar_api.dart';

http.Response _jsonResponse(String body, int status) =>
    http.Response(body, status, headers: {'content-type': 'application/json'});

const _avatarJson = '{"avatarStyleId":"cosmic-explorer","thirdPartyAvatarUrl":null,'
    '"showAvatarOnProfile":true}';

void main() {
  group('AvatarApi.fetchStyleCatalog', () {
    test('sends the bearer token and parses the catalog', () async {
      final api = AvatarApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.headers['Authorization'], 'Bearer a-jwt');
          expect(request.url.path, '/profile/avatar/styles');
          return _jsonResponse(
            '[{"id":"cosmic-explorer","label":"Cosmic Explorer","previewUrl":"https://cdn.example.com/a.png"}]',
            200,
          );
        }),
      );

      final catalog = await api.fetchStyleCatalog();

      expect(catalog, hasLength(1));
      expect(catalog.first.id, 'cosmic-explorer');
    });

    test('throws AvatarApiException on a non-200 response', () async {
      final api = AvatarApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async => http.Response('', 500)),
      );

      expect(() => api.fetchStyleCatalog(), throwsA(isA<AvatarApiException>()));
    });
  });

  group('AvatarApi.fetchMyAvatar', () {
    test('parses the current avatar selection', () async {
      final api = AvatarApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.url.path, '/profile/avatar');
          return _jsonResponse(_avatarJson, 200);
        }),
      );

      final avatar = await api.fetchMyAvatar();

      expect(avatar.avatarStyleId, 'cosmic-explorer');
      expect(avatar.hasAvatar, isTrue);
    });
  });

  group('AvatarApi.selectAvatarStyle', () {
    test('sends the style id and parses the updated avatar', () async {
      http.Request? putRequest;
      final api = AvatarApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          putRequest = request;
          return _jsonResponse(_avatarJson, 200);
        }),
      );

      await api.selectAvatarStyle('cosmic-explorer');

      expect(putRequest!.url.path, '/profile/avatar/style');
      expect(putRequest!.body, '{"avatarStyleId":"cosmic-explorer"}');
    });

    test('throws AvatarApiException for an unknown style', () async {
      final api = AvatarApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => _jsonResponse('{"message":"Unknown avatar style."}', 400),
        ),
      );

      expect(() => api.selectAvatarStyle('nope'), throwsA(isA<AvatarApiException>()));
    });
  });

  group('AvatarApi.linkThirdPartyAvatar', () {
    test('sends the url and parses the updated avatar', () async {
      http.Request? putRequest;
      final api = AvatarApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          putRequest = request;
          return _jsonResponse(
            '{"avatarStyleId":null,"thirdPartyAvatarUrl":"https://bitmoji.example.com/mine.png",'
            '"showAvatarOnProfile":true}',
            200,
          );
        }),
      );

      final avatar = await api.linkThirdPartyAvatar('https://bitmoji.example.com/mine.png');

      expect(putRequest!.url.path, '/profile/avatar/link');
      expect(putRequest!.body, '{"url":"https://bitmoji.example.com/mine.png"}');
      expect(avatar.thirdPartyAvatarUrl, 'https://bitmoji.example.com/mine.png');
    });
  });

  group('AvatarApi.clearAvatar', () {
    test('sends a DELETE and parses the cleared avatar', () async {
      http.Request? deleteRequest;
      final api = AvatarApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          deleteRequest = request;
          return _jsonResponse(
            '{"avatarStyleId":null,"thirdPartyAvatarUrl":null,"showAvatarOnProfile":true}',
            200,
          );
        }),
      );

      final avatar = await api.clearAvatar();

      expect(deleteRequest!.method, 'DELETE');
      expect(avatar.hasAvatar, isFalse);
    });
  });

  group('AvatarApi.setShowAvatarOnProfile', () {
    test('sends the flag and parses the updated avatar', () async {
      http.Request? putRequest;
      final api = AvatarApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          putRequest = request;
          return _jsonResponse(
            '{"avatarStyleId":"cosmic-explorer","thirdPartyAvatarUrl":null,"showAvatarOnProfile":false}',
            200,
          );
        }),
      );

      final avatar = await api.setShowAvatarOnProfile(false);

      expect(putRequest!.url.path, '/profile/avatar/visibility');
      expect(putRequest!.body, '{"showAvatarOnProfile":false}');
      expect(avatar.showAvatarOnProfile, isFalse);
    });
  });
}
