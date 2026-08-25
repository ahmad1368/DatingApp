import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/community_groups/community_groups_api.dart';

http.Response _jsonResponse(String body, int status) =>
    http.Response(body, status, headers: {'content-type': 'application/json'});

void main() {
  group('CommunityGroupsApi.fetchGroups', () {
    test('parses the group catalog', () async {
      final api = CommunityGroupsApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.url.path, '/community-groups');
          return _jsonResponse(
            '[{"id":"book-lovers","name":"Book Lovers","description":"Bookworms."}]',
            200,
          );
        }),
      );

      final groups = await api.fetchGroups();

      expect(groups, hasLength(1));
      expect(groups.first.id, 'book-lovers');
      expect(groups.first.name, 'Book Lovers');
    });

    test('throws CommunityGroupsApiException on a non-200 response', () async {
      final api = CommunityGroupsApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async => _jsonResponse('{"message":"boom"}', 500)),
      );

      expect(() => api.fetchGroups(), throwsA(isA<CommunityGroupsApiException>()));
    });
  });

  group('CommunityGroupsApi.fetchMyGroups', () {
    test('sends the bearer token and parses the joined group ids', () async {
      final api = CommunityGroupsApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.headers['Authorization'], 'Bearer a-jwt');
          expect(request.url.path, '/community-groups/me');
          return _jsonResponse('["book-lovers"]', 200);
        }),
      );

      final groups = await api.fetchMyGroups();

      expect(groups, ['book-lovers']);
    });
  });

  group('CommunityGroupsApi.joinGroup', () {
    test('sends the group id and parses the updated membership list', () async {
      final api = CommunityGroupsApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.method, 'POST');
          expect(request.url.path, '/community-groups/me');
          expect(request.body, '{"groupId":"foodies"}');
          return _jsonResponse('["book-lovers","foodies"]', 200);
        }),
      );

      final groups = await api.joinGroup('foodies');

      expect(groups, ['book-lovers', 'foodies']);
    });

    test('throws CommunityGroupsApiException on a non-200 response', () async {
      final api = CommunityGroupsApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async =>
              _jsonResponse('{"message":"You can only join up to 5 community groups."}', 400),
        ),
      );

      expect(() => api.joinGroup('foodies'), throwsA(isA<CommunityGroupsApiException>()));
    });
  });

  group('CommunityGroupsApi.leaveGroup', () {
    test('sends a DELETE and parses the updated membership list', () async {
      final api = CommunityGroupsApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.method, 'DELETE');
          expect(request.url.path, '/community-groups/me/book-lovers');
          return _jsonResponse('[]', 200);
        }),
      );

      final groups = await api.leaveGroup('book-lovers');

      expect(groups, isEmpty);
    });
  });

  group('CommunityGroupsApi.fetchGroupMembers', () {
    test('sends the bearer token and parses the member list', () async {
      final api = CommunityGroupsApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.headers['Authorization'], 'Bearer a-jwt');
          expect(request.url.path, '/community-groups/book-lovers/members');
          return _jsonResponse(
            '[{"id":"user-2","name":"Jane","age":29,"profilePhotoUrl":"jane.jpg"}]',
            200,
          );
        }),
      );

      final members = await api.fetchGroupMembers('book-lovers');

      expect(members, hasLength(1));
      expect(members.first.id, 'user-2');
      expect(members.first.name, 'Jane');
      expect(members.first.age, 29);
      expect(members.first.profilePhotoUrl, 'jane.jpg');
    });

    test('throws CommunityGroupsApiException on a non-200 response', () async {
      final api = CommunityGroupsApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async => _jsonResponse('{"message":"boom"}', 400)),
      );

      expect(() => api.fetchGroupMembers('book-lovers'), throwsA(isA<CommunityGroupsApiException>()));
    });
  });
}
