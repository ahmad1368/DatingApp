import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/profile/avatar_api.dart';
import 'package:mobile/profile/avatar_screen.dart';

http.Response _jsonResponse(String body, int status) =>
    http.Response(body, status, headers: {'content-type': 'application/json'});

const _catalogResponse =
    '[{"id":"cosmic-explorer","label":"Cosmic Explorer","previewUrl":"https://cdn.example.com/a.png"}]';

void main() {
  testWidgets('shows the catalog and the current avatar state', (tester) async {
    final api = AvatarApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/profile/avatar/styles') {
          return _jsonResponse(_catalogResponse, 200);
        }
        return _jsonResponse(
          '{"avatarStyleId":null,"thirdPartyAvatarUrl":null,"showAvatarOnProfile":true}',
          200,
        );
      }),
    );

    await tester.pumpWidget(MaterialApp(home: AvatarScreen(avatarApi: api)));
    await tester.pumpAndSettle();

    expect(find.text('Cosmic Explorer'), findsOneWidget);
    expect(find.text('Show avatar on my public profile'), findsOneWidget);
    expect(find.text('Remove avatar'), findsNothing);
  });

  testWidgets('selecting a style updates the avatar and shows the remove button', (tester) async {
    http.Request? putRequest;
    final api = AvatarApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/profile/avatar/styles') {
          return _jsonResponse(_catalogResponse, 200);
        }
        if (request.method == 'PUT' && request.url.path == '/profile/avatar/style') {
          putRequest = request;
          return _jsonResponse(
            '{"avatarStyleId":"cosmic-explorer","thirdPartyAvatarUrl":null,"showAvatarOnProfile":true}',
            200,
          );
        }
        return _jsonResponse(
          '{"avatarStyleId":null,"thirdPartyAvatarUrl":null,"showAvatarOnProfile":true}',
          200,
        );
      }),
    );

    await tester.pumpWidget(MaterialApp(home: AvatarScreen(avatarApi: api)));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Cosmic Explorer'));
    await tester.pumpAndSettle();

    expect(putRequest, isNotNull);
    expect(putRequest!.body, '{"avatarStyleId":"cosmic-explorer"}');
    expect(find.text('Remove avatar'), findsOneWidget);
  });

  testWidgets('linking a third-party avatar sends the url', (tester) async {
    http.Request? linkRequest;
    final api = AvatarApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/profile/avatar/styles') {
          return _jsonResponse(_catalogResponse, 200);
        }
        if (request.method == 'PUT' && request.url.path == '/profile/avatar/link') {
          linkRequest = request;
          return _jsonResponse(
            '{"avatarStyleId":null,"thirdPartyAvatarUrl":"https://bitmoji.example.com/mine.png",'
            '"showAvatarOnProfile":true}',
            200,
          );
        }
        return _jsonResponse(
          '{"avatarStyleId":null,"thirdPartyAvatarUrl":null,"showAvatarOnProfile":true}',
          200,
        );
      }),
    );

    await tester.pumpWidget(MaterialApp(home: AvatarScreen(avatarApi: api)));
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField), 'https://bitmoji.example.com/mine.png');
    await tester.tap(find.text('Link avatar'));
    await tester.pumpAndSettle();

    expect(linkRequest, isNotNull);
    expect(linkRequest!.body, '{"url":"https://bitmoji.example.com/mine.png"}');
    expect(find.text('Remove avatar'), findsOneWidget);
  });

  testWidgets('removing the avatar clears it', (tester) async {
    http.Request? deleteRequest;
    final api = AvatarApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/profile/avatar/styles') {
          return _jsonResponse(_catalogResponse, 200);
        }
        if (request.method == 'DELETE') {
          deleteRequest = request;
          return _jsonResponse(
            '{"avatarStyleId":null,"thirdPartyAvatarUrl":null,"showAvatarOnProfile":true}',
            200,
          );
        }
        return _jsonResponse(
          '{"avatarStyleId":"cosmic-explorer","thirdPartyAvatarUrl":null,"showAvatarOnProfile":true}',
          200,
        );
      }),
    );

    await tester.pumpWidget(MaterialApp(home: AvatarScreen(avatarApi: api)));
    await tester.pumpAndSettle();

    expect(find.text('Remove avatar'), findsOneWidget);

    await tester.tap(find.text('Remove avatar'));
    await tester.pumpAndSettle();

    expect(deleteRequest, isNotNull);
    expect(find.text('Remove avatar'), findsNothing);
  });

  testWidgets('shows an error when loading fails', (tester) async {
    final api = AvatarApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async => _jsonResponse('{"message":"boom"}', 500)),
    );

    await tester.pumpWidget(MaterialApp(home: AvatarScreen(avatarApi: api)));
    await tester.pumpAndSettle();

    expect(find.text('boom'), findsOneWidget);
  });
}
