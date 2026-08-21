import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/vault/vault_api.dart';
import 'package:mobile/vault/vault_granted_screen.dart';

void main() {
  testWidgets('shows an empty state when nothing has been shared', (tester) async {
    final api = VaultApi(
      accessToken: 'a-jwt',
      client: MockClient(
        (request) async => http.Response('[]', 200, headers: {'content-type': 'application/json'}),
      ),
    );

    await tester.pumpWidget(
      MaterialApp(home: VaultGrantedScreen(vaultApi: api, matchId: 'match-1')),
    );
    await tester.pumpAndSettle();

    expect(find.text('Nothing shared with you yet.'), findsOneWidget);
  });

  testWidgets('requests the granted photos for the given match', (tester) async {
    http.Request? capturedRequest;
    final api = VaultApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        capturedRequest = request;
        return http.Response(
          '[{"id":"photo-1","mediaUrl":"https://example.com/a.jpg",'
          '"grantedAt":"2026-01-01T00:00:00.000Z"}]',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(
      MaterialApp(home: VaultGrantedScreen(vaultApi: api, matchId: 'match-1')),
    );
    await tester.pumpAndSettle();

    expect(capturedRequest!.url.path, '/vault/matches/match-1');
    expect(find.text('Nothing shared with you yet.'), findsNothing);
  });

  testWidgets('shows an error when the request fails', (tester) async {
    final api = VaultApi(
      accessToken: 'a-jwt',
      client: MockClient(
        (request) async => http.Response(
          '{"message":"Match not found."}',
          404,
          headers: {'content-type': 'application/json'},
        ),
      ),
    );

    await tester.pumpWidget(
      MaterialApp(home: VaultGrantedScreen(vaultApi: api, matchId: 'match-1')),
    );
    await tester.pumpAndSettle();

    expect(find.text('Match not found.'), findsOneWidget);
  });
}
