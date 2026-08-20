import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/blocking/blocked_contacts_screen.dart';
import 'package:mobile/blocking/blocking_api.dart';

http.Response _jsonResponse(String body, int status) =>
    http.Response(body, status, headers: {'content-type': 'application/json'});

void main() {
  testWidgets('shows an empty state when there are no blocked contacts', (tester) async {
    final api = BlockingApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async => _jsonResponse('[]', 200)),
    );

    await tester.pumpWidget(MaterialApp(home: BlockedContactsScreen(blockingApi: api)));
    await tester.pumpAndSettle();

    expect(find.text('No blocked contacts yet.'), findsOneWidget);
  });

  testWidgets('lists blocked contacts and unblocks one', (tester) async {
    http.Request? unblockRequest;
    var fetchCallCount = 0;
    final api = BlockingApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.method == 'DELETE') {
          unblockRequest = request;
          return http.Response('', 200);
        }
        fetchCallCount += 1;
        return _jsonResponse(
          '[{"id":"block-1","contactValue":"+15551234567","blockedUserId":"user-2",'
          '"blockedUserName":"Alex","blockedUserPhotoUrl":null,'
          '"createdAt":"2026-01-01T00:00:00.000Z"}]',
          200,
        );
      }),
    );

    await tester.pumpWidget(MaterialApp(home: BlockedContactsScreen(blockingApi: api)));
    await tester.pumpAndSettle();

    expect(find.text('Alex'), findsOneWidget);
    expect(find.text('On the app - hidden from each other'), findsOneWidget);

    await tester.tap(find.text('Unblock'));
    await tester.pumpAndSettle();

    expect(unblockRequest, isNotNull);
    expect(unblockRequest!.url.path, '/blocking/blocked-contacts/block-1');
    expect(find.text('Alex'), findsNothing);
    expect(fetchCallCount, 1);
  });

  testWidgets('syncing contacts splits on commas and newlines and reloads the list', (
    tester,
  ) async {
    http.Request? syncRequest;
    var fetchCallCount = 0;
    final api = BlockingApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.method == 'POST') {
          syncRequest = request;
          return _jsonResponse('{"totalSubmitted":2,"matchedUsers":1}', 200);
        }
        fetchCallCount += 1;
        return _jsonResponse('[]', 200);
      }),
    );

    await tester.pumpWidget(MaterialApp(home: BlockedContactsScreen(blockingApi: api)));
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField), '+15551234567,\nfriend@example.com');
    await tester.tap(find.text('Block these contacts'));
    await tester.pumpAndSettle();

    expect(syncRequest, isNotNull);
    expect(syncRequest!.body, '{"contacts":["+15551234567","friend@example.com"]}');
    expect(
      find.text('Blocked 1 of 2 contacts who are on the app.'),
      findsOneWidget,
    );
    expect(fetchCallCount, 2);
  });
}
