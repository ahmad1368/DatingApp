import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/community_groups/community_groups_api.dart';
import 'package:mobile/community_groups/group_members_screen.dart';

http.Response _jsonResponse(String body, int status) =>
    http.Response(body, status, headers: {'content-type': 'application/json'});

void main() {
  testWidgets('shows the group members', (tester) async {
    final api = CommunityGroupsApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        expect(request.url.path, '/community-groups/book-lovers/members');
        return _jsonResponse(
          '[{"id":"user-2","name":"Jane","age":29,"profilePhotoUrl":null}]',
          200,
        );
      }),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: GroupMembersScreen(
          communityGroupsApi: api,
          groupId: 'book-lovers',
          groupName: 'Book Lovers',
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Book Lovers'), findsOneWidget);
    expect(find.text('Jane'), findsOneWidget);
    expect(find.text('29'), findsOneWidget);
  });

  testWidgets('shows an empty state when there are no other members', (tester) async {
    final api = CommunityGroupsApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async => _jsonResponse('[]', 200)),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: GroupMembersScreen(
          communityGroupsApi: api,
          groupId: 'book-lovers',
          groupName: 'Book Lovers',
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('No one else here yet.'), findsOneWidget);
  });

  testWidgets('shows an error when the request fails', (tester) async {
    final api = CommunityGroupsApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async => _jsonResponse('{"message":"boom"}', 500)),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: GroupMembersScreen(
          communityGroupsApi: api,
          groupId: 'book-lovers',
          groupName: 'Book Lovers',
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('boom'), findsOneWidget);
  });
}
