import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/community_groups/community_groups_api.dart';
import 'package:mobile/community_groups/community_groups_screen.dart';

http.Response _jsonResponse(String body, int status) =>
    http.Response(body, status, headers: {'content-type': 'application/json'});

const _catalogResponse = '[{"id":"book-lovers","name":"Book Lovers","description":"Bookworms."},'
    '{"id":"foodies","name":"Foodies","description":"All things food."}]';

void main() {
  testWidgets('shows the catalog with joined groups marked', (tester) async {
    final api = CommunityGroupsApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/community-groups/me') {
          return _jsonResponse('["book-lovers"]', 200);
        }
        return _jsonResponse(_catalogResponse, 200);
      }),
    );

    await tester.pumpWidget(MaterialApp(home: CommunityGroupsScreen(communityGroupsApi: api)));
    await tester.pumpAndSettle();

    expect(find.text('Book Lovers'), findsOneWidget);
    expect(find.text('Foodies'), findsOneWidget);
    final joinedChip = tester.widget<FilterChip>(
      find.ancestor(of: find.text('Joined'), matching: find.byType(FilterChip)),
    );
    expect(joinedChip.selected, isTrue);
  });

  testWidgets('tapping join sends the request and updates the chip', (tester) async {
    http.Request? joinRequest;
    final api = CommunityGroupsApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/community-groups/me' && request.method == 'GET') {
          return _jsonResponse('[]', 200);
        }
        if (request.method == 'POST') {
          joinRequest = request;
          return _jsonResponse('["foodies"]', 200);
        }
        return _jsonResponse(_catalogResponse, 200);
      }),
    );

    await tester.pumpWidget(MaterialApp(home: CommunityGroupsScreen(communityGroupsApi: api)));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Join').last);
    await tester.pumpAndSettle();

    expect(joinRequest, isNotNull);
    expect(joinRequest!.body, '{"groupId":"foodies"}');
    expect(find.text('Joined'), findsOneWidget);
  });

  testWidgets('tapping a joined group opens its member browse screen', (tester) async {
    final api = CommunityGroupsApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/community-groups/me') {
          return _jsonResponse('["book-lovers"]', 200);
        }
        if (request.url.path == '/community-groups/book-lovers/members') {
          return _jsonResponse('[{"id":"user-2","name":"Jane","age":29}]', 200);
        }
        return _jsonResponse(_catalogResponse, 200);
      }),
    );

    await tester.pumpWidget(MaterialApp(home: CommunityGroupsScreen(communityGroupsApi: api)));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Book Lovers'));
    await tester.pumpAndSettle();

    expect(find.text('Jane'), findsOneWidget);
  });

  testWidgets('tapping a group not yet joined does not navigate', (tester) async {
    final api = CommunityGroupsApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/community-groups/me') {
          return _jsonResponse('[]', 200);
        }
        return _jsonResponse(_catalogResponse, 200);
      }),
    );

    await tester.pumpWidget(MaterialApp(home: CommunityGroupsScreen(communityGroupsApi: api)));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Book Lovers'));
    await tester.pumpAndSettle();

    expect(find.text('Community Groups'), findsOneWidget);
  });
}
