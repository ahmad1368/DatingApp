import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/blind_dating/blind_dating_api.dart';
import 'package:mobile/blind_dating/blind_dating_screen.dart';

http.Response _jsonResponse(String body, int status) =>
    http.Response(body, status, headers: {'content-type': 'application/json'});

const _noneStatusResponse = '{"status":"NONE","sessionId":null,"expiresAt":null,'
    '"isRevealed":false,"myRevealRequested":false,"otherRevealRequested":false,'
    '"otherProfile":null}';

void main() {
  testWidgets('shows a start button when there is no session', (tester) async {
    final api = BlindDatingApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async => _jsonResponse(_noneStatusResponse, 200)),
    );

    await tester.pumpWidget(
      MaterialApp(home: BlindDatingScreen(blindDatingApi: api, currentUserId: 'user-1')),
    );
    await tester.pump();

    expect(find.text('Start blind dating'), findsOneWidget);
  });

  testWidgets('joining the queue shows the waiting state', (tester) async {
    final api = BlindDatingApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.method == 'POST' && request.url.path == '/blind-dating/queue/join') {
          return _jsonResponse(
            '{"status":"WAITING","sessionId":null,"expiresAt":null,"isRevealed":false,'
            '"myRevealRequested":false,"otherRevealRequested":false,"otherProfile":null}',
            200,
          );
        }
        return _jsonResponse(_noneStatusResponse, 200);
      }),
    );

    await tester.pumpWidget(
      MaterialApp(home: BlindDatingScreen(blindDatingApi: api, currentUserId: 'user-1')),
    );
    await tester.pump();

    await tester.tap(find.text('Start blind dating'));
    await tester.pump();

    expect(find.text('Waiting for a match…'), findsOneWidget);
  });

  testWidgets('shows the chat and sends a message while active', (tester) async {
    http.Request? sendRequest;
    final api = BlindDatingApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/blind-dating/status') {
          return _jsonResponse(
            '{"status":"ACTIVE","sessionId":"session-1","expiresAt":"2026-01-01T00:10:00.000Z",'
            '"isRevealed":false,"myRevealRequested":false,"otherRevealRequested":false,'
            '"otherProfile":null}',
            200,
          );
        }
        if (request.url.path == '/blind-dating/sessions/session-1/messages' &&
            request.method == 'GET') {
          return _jsonResponse('[]', 200);
        }
        if (request.method == 'POST' &&
            request.url.path == '/blind-dating/sessions/session-1/messages') {
          sendRequest = request;
          return _jsonResponse(
            '{"id":"m1","senderId":"user-1","content":"hey!","createdAt":"2026-01-01T00:01:00.000Z"}',
            201,
          );
        }
        return _jsonResponse('[]', 200);
      }),
    );

    await tester.pumpWidget(
      MaterialApp(home: BlindDatingScreen(blindDatingApi: api, currentUserId: 'user-1')),
    );
    await tester.pump();
    await tester.pump();

    expect(find.text('Say hi to your anonymous match!'), findsOneWidget);

    await tester.enterText(find.byType(TextField), 'hey!');
    await tester.tap(find.byIcon(Icons.send));
    await tester.pump();
    await tester.pump();

    expect(sendRequest, isNotNull);
    expect(sendRequest!.body, '{"content":"hey!"}');
    expect(find.text('hey!'), findsOneWidget);
  });

  testWidgets('requesting reveal shows the waiting-on-other-side message', (tester) async {
    final api = BlindDatingApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/blind-dating/status') {
          return _jsonResponse(
            '{"status":"ACTIVE","sessionId":"session-1","expiresAt":"2026-01-01T00:10:00.000Z",'
            '"isRevealed":false,"myRevealRequested":false,"otherRevealRequested":false,'
            '"otherProfile":null}',
            200,
          );
        }
        if (request.url.path == '/blind-dating/sessions/session-1/messages') {
          return _jsonResponse('[]', 200);
        }
        if (request.method == 'POST' &&
            request.url.path == '/blind-dating/sessions/session-1/reveal') {
          return _jsonResponse(
            '{"status":"ACTIVE","sessionId":"session-1","expiresAt":"2026-01-01T00:10:00.000Z",'
            '"isRevealed":false,"myRevealRequested":true,"otherRevealRequested":false,'
            '"otherProfile":null}',
            200,
          );
        }
        return _jsonResponse('[]', 200);
      }),
    );

    await tester.pumpWidget(
      MaterialApp(home: BlindDatingScreen(blindDatingApi: api, currentUserId: 'user-1')),
    );
    await tester.pump();
    await tester.pump();

    await tester.tap(find.byIcon(Icons.face_retouching_natural));
    await tester.pump();
    await tester.pump();

    expect(find.text('Waiting for the other person to agree to reveal…'), findsOneWidget);
  });

  testWidgets('shows the revealed profile once both sides agree', (tester) async {
    final api = BlindDatingApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/blind-dating/status') {
          return _jsonResponse(
            '{"status":"ACTIVE","sessionId":"session-1","expiresAt":"2026-01-01T00:10:00.000Z",'
            '"isRevealed":true,"myRevealRequested":true,"otherRevealRequested":true,'
            '"otherProfile":{"id":"user-2","name":"Alex","profilePhotoUrl":null}}',
            200,
          );
        }
        if (request.url.path == '/blind-dating/sessions/session-1/messages') {
          return _jsonResponse('[]', 200);
        }
        return _jsonResponse('[]', 200);
      }),
    );

    await tester.pumpWidget(
      MaterialApp(home: BlindDatingScreen(blindDatingApi: api, currentUserId: 'user-1')),
    );
    await tester.pump();
    await tester.pump();

    expect(find.text("It's Alex!"), findsOneWidget);
  });
}
