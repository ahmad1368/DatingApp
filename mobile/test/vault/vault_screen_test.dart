import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/messaging/messaging_api.dart';
import 'package:mobile/vault/vault_api.dart';
import 'package:mobile/vault/vault_photo_picker_controller.dart';
import 'package:mobile/vault/vault_screen.dart';

class _FakePicker implements VaultPhotoPickerController {
  String? nextPath = 'file:///tmp/photo.jpg';

  @override
  Future<String?> pickPhoto() async => nextPath;
}

void main() {
  testWidgets('shows an empty state when there are no vault photos', (tester) async {
    final vaultApi = VaultApi(
      accessToken: 'a-jwt',
      client: MockClient(
        (request) async => http.Response('[]', 200, headers: {'content-type': 'application/json'}),
      ),
    );
    final messagingApi = MessagingApi(
      accessToken: 'a-jwt',
      client: MockClient(
        (request) async => http.Response('[]', 200, headers: {'content-type': 'application/json'}),
      ),
    );

    await tester.pumpWidget(
      MaterialApp(home: VaultScreen(vaultApi: vaultApi, messagingApi: messagingApi)),
    );
    await tester.pumpAndSettle();

    expect(find.text('No vault photos yet. Add one to get started.'), findsOneWidget);
  });

  testWidgets('lists vault photos with their lock/share status', (tester) async {
    final vaultApi = VaultApi(
      accessToken: 'a-jwt',
      client: MockClient(
        (request) async => http.Response(
          '[{"id":"photo-1","mediaUrl":"https://example.com/a.jpg",'
          '"createdAt":"2026-01-01T00:00:00.000Z","grantedMatchIds":[]}]',
          200,
          headers: {'content-type': 'application/json'},
        ),
      ),
    );
    final messagingApi = MessagingApi(
      accessToken: 'a-jwt',
      client: MockClient(
        (request) async => http.Response('[]', 200, headers: {'content-type': 'application/json'}),
      ),
    );

    await tester.pumpWidget(
      MaterialApp(home: VaultScreen(vaultApi: vaultApi, messagingApi: messagingApi)),
    );
    await tester.pumpAndSettle();

    expect(find.text('Locked'), findsOneWidget);
  });

  testWidgets('adding a photo picks and uploads it', (tester) async {
    http.Request? addRequest;
    var fetchCount = 0;
    final vaultApi = VaultApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.method == 'POST' && request.url.path == '/vault/photos') {
          addRequest = request;
          return http.Response(
            '{"id":"photo-1","mediaUrl":"file:///tmp/photo.jpg",'
            '"createdAt":"2026-01-01T00:00:00.000Z","grantedMatchIds":[]}',
            201,
            headers: {'content-type': 'application/json'},
          );
        }
        fetchCount += 1;
        final body = fetchCount == 1
            ? '[]'
            : '[{"id":"photo-1","mediaUrl":"file:///tmp/photo.jpg",'
                '"createdAt":"2026-01-01T00:00:00.000Z","grantedMatchIds":[]}]';
        return http.Response(body, 200, headers: {'content-type': 'application/json'});
      }),
    );
    final messagingApi = MessagingApi(
      accessToken: 'a-jwt',
      client: MockClient(
        (request) async => http.Response('[]', 200, headers: {'content-type': 'application/json'}),
      ),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: VaultScreen(
          vaultApi: vaultApi,
          messagingApi: messagingApi,
          picker: _FakePicker(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(Icons.add_a_photo));
    await tester.pumpAndSettle();

    expect(addRequest, isNotNull);
    expect(addRequest!.body, '{"mediaUrl":"file:///tmp/photo.jpg"}');
    expect(find.text('Locked'), findsOneWidget);
  });

  testWidgets('deleting a photo removes it from the grid', (tester) async {
    http.Request? deleteRequest;
    final vaultApi = VaultApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.method == 'DELETE') {
          deleteRequest = request;
          return http.Response('', 200);
        }
        return http.Response(
          '[{"id":"photo-1","mediaUrl":"https://example.com/a.jpg",'
          '"createdAt":"2026-01-01T00:00:00.000Z","grantedMatchIds":[]}]',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );
    final messagingApi = MessagingApi(
      accessToken: 'a-jwt',
      client: MockClient(
        (request) async => http.Response('[]', 200, headers: {'content-type': 'application/json'}),
      ),
    );

    await tester.pumpWidget(
      MaterialApp(home: VaultScreen(vaultApi: vaultApi, messagingApi: messagingApi)),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(Icons.delete));
    await tester.pumpAndSettle();

    expect(deleteRequest, isNotNull);
    expect(deleteRequest!.url.path, '/vault/photos/photo-1');
    expect(find.text('No vault photos yet. Add one to get started.'), findsOneWidget);
  });

  testWidgets('managing access shows matches and grants on toggle', (tester) async {
    http.Request? grantRequest;
    final vaultApi = VaultApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.method == 'POST' && request.url.path.endsWith('/grant')) {
          grantRequest = request;
          return http.Response('', 200);
        }
        return http.Response(
          '[{"id":"photo-1","mediaUrl":"https://example.com/a.jpg",'
          '"createdAt":"2026-01-01T00:00:00.000Z","grantedMatchIds":[]}]',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );
    final messagingApi = MessagingApi(
      accessToken: 'a-jwt',
      client: MockClient(
        (request) async => http.Response(
          '[{"matchId":"match-1","otherUserId":"user-2","otherUserName":"Jane",'
          '"otherUserPhotoUrl":null,"expiresAt":null,"firstMessageSent":true,'
          '"createdAt":"2026-01-01T00:00:00.000Z"}]',
          200,
          headers: {'content-type': 'application/json'},
        ),
      ),
    );

    await tester.pumpWidget(
      MaterialApp(home: VaultScreen(vaultApi: vaultApi, messagingApi: messagingApi)),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(Icons.lock_open));
    await tester.pumpAndSettle();

    expect(find.text('Jane'), findsOneWidget);

    await tester.tap(find.byType(Switch));
    await tester.pumpAndSettle();

    expect(grantRequest, isNotNull);
    expect(grantRequest!.body, '{"matchId":"match-1"}');
  });
}
