import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/messaging/match_chat_screen.dart';
import 'package:mobile/messaging/messaging_api.dart';
import 'package:mobile/profile/voice_player_controller.dart';
import 'package:mobile/profile/voice_recorder_controller.dart';

const _emptyMessages = '[]';

class _FakeRecorder implements VoiceRecorderController {
  bool granted = true;
  bool started = false;
  String stopPath = 'file:///tmp/fake-note.m4a';

  @override
  Future<bool> hasPermission() async => granted;

  @override
  Future<void> start() async {
    started = true;
  }

  @override
  Future<String?> stop() async => stopPath;
}

class _FakePlayer implements VoicePlayerController {
  String? lastPlayedPath;

  @override
  Future<void> play(String path) async {
    lastPlayedPath = path;
  }

  @override
  Future<void> stop() async {}
}

void main() {
  testWidgets('hides the composer and shows a banner while waiting on her first message', (
    tester,
  ) async {
    final api = MessagingApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path.endsWith('/messages')) {
          return http.Response(_emptyMessages, 200, headers: {'content-type': 'application/json'});
        }
        return http.Response(
          '{"matchId":"match-1","expiresAt":"2026-01-02T00:00:00.000Z",'
          '"isExpired":false,"firstMessageSent":false,"canSendFirstMessage":false}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: MatchChatScreen(messagingApi: api, matchId: 'match-1', currentUserId: 'user-man'),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Waiting for her to send the first message.'), findsOneWidget);
    expect(find.byType(TextField), findsNothing);
  });

  testWidgets('lets the woman type and send the first message', (tester) async {
    http.Request? sendRequest;
    final api = MessagingApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/matches/moderation/check') {
          return http.Response(
            '{"flagged":false,"categories":[]}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        if (request.method == 'POST') {
          sendRequest = request;
          return http.Response(
            '{"id":"m1","senderId":"user-woman","contentType":"TEXT","content":"hi!",'
            '"mediaUrl":null,"isBlurred":false,"createdAt":"2026-01-01T00:00:00.000Z"}',
            201,
            headers: {'content-type': 'application/json'},
          );
        }
        if (request.url.path.endsWith('/messages')) {
          return http.Response(_emptyMessages, 200, headers: {'content-type': 'application/json'});
        }
        return http.Response(
          '{"matchId":"match-1","expiresAt":"2026-01-02T00:00:00.000Z",'
          '"isExpired":false,"firstMessageSent":false,"canSendFirstMessage":true}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: MatchChatScreen(messagingApi: api, matchId: 'match-1', currentUserId: 'user-woman'),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.byType(TextField), findsOneWidget);

    await tester.enterText(find.byType(TextField), 'hi!');
    await tester.tap(find.byIcon(Icons.send));
    await tester.pumpAndSettle();

    expect(sendRequest, isNotNull);
    expect(sendRequest!.body, '{"content":"hi!"}');
    expect(find.text('hi!'), findsOneWidget);
  });

  testWidgets('shows an expired banner and no composer once the match has expired', (tester) async {
    final api = MessagingApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path.endsWith('/messages')) {
          return http.Response(_emptyMessages, 200, headers: {'content-type': 'application/json'});
        }
        return http.Response(
          '{"matchId":"match-1","expiresAt":"2026-01-02T00:00:00.000Z",'
          '"isExpired":true,"firstMessageSent":false,"canSendFirstMessage":false}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: MatchChatScreen(messagingApi: api, matchId: 'match-1', currentUserId: 'user-man'),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('This match has expired.'), findsOneWidget);
    expect(find.byType(TextField), findsNothing);
  });

  testWidgets('shows a tap-to-reveal overlay for a blurred photo from the other person', (
    tester,
  ) async {
    final api = MessagingApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path.endsWith('/messages')) {
          return http.Response(
            '[{"id":"m1","senderId":"user-woman","contentType":"IMAGE","content":null,'
            '"mediaUrl":"https://example.com/photo.jpg","isBlurred":true,'
            '"createdAt":"2026-01-01T00:00:00.000Z"}]',
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response(
          '{"matchId":"match-1","expiresAt":null,"isExpired":false,'
          '"firstMessageSent":true,"canSendFirstMessage":true}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: MatchChatScreen(messagingApi: api, matchId: 'match-1', currentUserId: 'user-man'),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Tap to reveal'), findsOneWidget);
  });

  testWidgets('does not blur a photo the current user sent themselves', (tester) async {
    final api = MessagingApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path.endsWith('/messages')) {
          return http.Response(
            '[{"id":"m1","senderId":"user-woman","contentType":"IMAGE","content":null,'
            '"mediaUrl":"https://example.com/photo.jpg","isBlurred":true,'
            '"createdAt":"2026-01-01T00:00:00.000Z"}]',
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response(
          '{"matchId":"match-1","expiresAt":null,"isExpired":false,'
          '"firstMessageSent":true,"canSendFirstMessage":true}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: MatchChatScreen(messagingApi: api, matchId: 'match-1', currentUserId: 'user-woman'),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Tap to reveal'), findsNothing);
  });

  testWidgets('tapping a blurred photo reveals it', (tester) async {
    http.Request? revealRequest;
    final api = MessagingApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path.endsWith('/reveal')) {
          revealRequest = request;
          return http.Response(
            '{"id":"m1","senderId":"user-woman","contentType":"IMAGE","content":null,'
            '"mediaUrl":"https://example.com/photo.jpg","isBlurred":false,'
            '"createdAt":"2026-01-01T00:00:00.000Z"}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        if (request.url.path.endsWith('/messages')) {
          return http.Response(
            '[{"id":"m1","senderId":"user-woman","contentType":"IMAGE","content":null,'
            '"mediaUrl":"https://example.com/photo.jpg","isBlurred":true,'
            '"createdAt":"2026-01-01T00:00:00.000Z"}]',
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response(
          '{"matchId":"match-1","expiresAt":null,"isExpired":false,'
          '"firstMessageSent":true,"canSendFirstMessage":true}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: MatchChatScreen(messagingApi: api, matchId: 'match-1', currentUserId: 'user-man'),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Tap to reveal'));
    await tester.pumpAndSettle();

    expect(revealRequest, isNotNull);
    expect(revealRequest!.url.path, '/matches/match-1/messages/m1/reveal');
    expect(find.text('Tap to reveal'), findsNothing);
  });

  testWidgets('opens the GIF picker, searches, and sends the selected GIF', (tester) async {
    http.Request? sendRequest;
    final api = MessagingApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/matches/gifs/search') {
          return http.Response(
            '[{"id":"g1","url":"https://example.com/g1.gif",'
            '"previewUrl":"https://example.com/g1-preview.gif"}]',
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        if (request.url.path.endsWith('/media')) {
          sendRequest = request;
          return http.Response(
            '{"id":"m2","senderId":"user-woman","contentType":"GIF","content":null,'
            '"mediaUrl":"https://example.com/g1.gif","isBlurred":false,'
            '"createdAt":"2026-01-01T00:00:00.000Z"}',
            201,
            headers: {'content-type': 'application/json'},
          );
        }
        if (request.url.path.endsWith('/messages')) {
          return http.Response(_emptyMessages, 200, headers: {'content-type': 'application/json'});
        }
        return http.Response(
          '{"matchId":"match-1","expiresAt":null,"isExpired":false,'
          '"firstMessageSent":true,"canSendFirstMessage":true}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: MatchChatScreen(messagingApi: api, matchId: 'match-1', currentUserId: 'user-woman'),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(Icons.gif_box_outlined));
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField).last, 'cats');
    await tester.tap(find.byIcon(Icons.search));
    await tester.pumpAndSettle();

    await tester.tap(
      find.descendant(of: find.byType(GridView), matching: find.byType(GestureDetector)),
    );
    await tester.pumpAndSettle();

    expect(sendRequest, isNotNull);
    expect(sendRequest!.body, '{"contentType":"GIF","mediaUrl":"https://example.com/g1.gif"}');
  });

  testWidgets('warns before sending a flagged message and only sends after confirming', (
    tester,
  ) async {
    http.Request? sendRequest;
    final api = MessagingApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/matches/moderation/check') {
          return http.Response(
            '{"flagged":true,"categories":["harassment"]}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        if (request.method == 'POST') {
          sendRequest = request;
          return http.Response(
            '{"id":"m1","senderId":"user-woman","contentType":"TEXT","content":"you are the worst",'
            '"mediaUrl":null,"isBlurred":false,"createdAt":"2026-01-01T00:00:00.000Z"}',
            201,
            headers: {'content-type': 'application/json'},
          );
        }
        if (request.url.path.endsWith('/messages')) {
          return http.Response(_emptyMessages, 200, headers: {'content-type': 'application/json'});
        }
        return http.Response(
          '{"matchId":"match-1","expiresAt":"2026-01-02T00:00:00.000Z",'
          '"isExpired":false,"firstMessageSent":false,"canSendFirstMessage":true}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: MatchChatScreen(messagingApi: api, matchId: 'match-1', currentUserId: 'user-woman'),
      ),
    );
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField), 'you are the worst');
    await tester.tap(find.byIcon(Icons.send));
    await tester.pumpAndSettle();

    expect(sendRequest, isNull);
    expect(find.text('Heads up'), findsOneWidget);
    expect(find.textContaining('harassment'), findsOneWidget);

    await tester.tap(find.text('Send anyway'));
    await tester.pumpAndSettle();

    expect(sendRequest, isNotNull);
    expect(sendRequest!.body, '{"content":"you are the worst"}');
  });

  testWidgets('long-pressing a message from the other person reports it', (tester) async {
    http.Request? reportRequest;
    final api = MessagingApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path.endsWith('/report')) {
          reportRequest = request;
          return http.Response('{}', 201, headers: {'content-type': 'application/json'});
        }
        if (request.url.path.endsWith('/messages')) {
          return http.Response(
            '[{"id":"m1","senderId":"user-man","contentType":"TEXT","content":"hey",'
            '"mediaUrl":null,"isBlurred":false,"createdAt":"2026-01-01T00:00:00.000Z"}]',
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response(
          '{"matchId":"match-1","expiresAt":null,"isExpired":false,'
          '"firstMessageSent":true,"canSendFirstMessage":true}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: MatchChatScreen(messagingApi: api, matchId: 'match-1', currentUserId: 'user-woman'),
      ),
    );
    await tester.pumpAndSettle();

    await tester.longPress(find.text('hey'));
    await tester.pumpAndSettle();

    expect(find.text('Report this message'), findsOneWidget);

    await tester.enterText(find.byType(TextField).last, 'harassing me');
    await tester.tap(find.text('Report'));
    await tester.pumpAndSettle();

    expect(reportRequest, isNotNull);
    expect(reportRequest!.url.path, '/matches/match-1/messages/m1/report');
    expect(reportRequest!.body, '{"reason":"harassing me"}');
  });

  testWidgets('shows a Read label under my own message once it has been read', (tester) async {
    final api = MessagingApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path.endsWith('/messages')) {
          return http.Response(
            '[{"id":"m1","senderId":"user-woman","contentType":"TEXT","content":"hi!",'
            '"mediaUrl":null,"isBlurred":false,"readAt":"2026-01-01T00:05:00.000Z",'
            '"createdAt":"2026-01-01T00:00:00.000Z"}]',
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response(
          '{"matchId":"match-1","expiresAt":null,"isExpired":false,'
          '"firstMessageSent":true,"canSendFirstMessage":true}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: MatchChatScreen(messagingApi: api, matchId: 'match-1', currentUserId: 'user-woman'),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Read'), findsOneWidget);
  });

  testWidgets('does not show a Read label for an unread message from the other person', (
    tester,
  ) async {
    final api = MessagingApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path.endsWith('/messages')) {
          return http.Response(
            '[{"id":"m1","senderId":"user-man","contentType":"TEXT","content":"hey",'
            '"mediaUrl":null,"isBlurred":false,"readAt":"2026-01-01T00:05:00.000Z",'
            '"createdAt":"2026-01-01T00:00:00.000Z"}]',
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response(
          '{"matchId":"match-1","expiresAt":null,"isExpired":false,'
          '"firstMessageSent":true,"canSendFirstMessage":true}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: MatchChatScreen(messagingApi: api, matchId: 'match-1', currentUserId: 'user-woman'),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Read'), findsNothing);
  });

  testWidgets('toggling read receipts calls the API and switches the icon', (tester) async {
    http.Request? toggleRequest;
    final api = MessagingApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.method == 'PUT' && request.url.path == '/matches/read-receipts') {
          toggleRequest = request;
          return http.Response(
            '{"readReceiptsEnabled":false}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        if (request.url.path.endsWith('/messages')) {
          return http.Response(_emptyMessages, 200, headers: {'content-type': 'application/json'});
        }
        return http.Response(
          '{"matchId":"match-1","expiresAt":null,"isExpired":false,'
          '"firstMessageSent":true,"canSendFirstMessage":true}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: MatchChatScreen(messagingApi: api, matchId: 'match-1', currentUserId: 'user-woman'),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.byIcon(Icons.done_all), findsOneWidget);

    await tester.tap(find.byIcon(Icons.done_all));
    await tester.pumpAndSettle();

    expect(toggleRequest, isNotNull);
    expect(toggleRequest!.body, '{"enabled":false}');
    expect(find.byIcon(Icons.done), findsOneWidget);
  });

  testWidgets('sending an icebreaker shows response options with no answers yet', (tester) async {
    http.Request? sendRequest;
    final api = MessagingApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/matches/icebreaker-prompts') {
          return http.Response(
            '[{"id":"coffee-or-tea","question":"Coffee or tea?","optionA":"Coffee","optionB":"Tea"}]',
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        if (request.method == 'POST' && request.url.path == '/matches/match-1/icebreaker') {
          sendRequest = request;
          return http.Response(
            '{"id":"m1","senderId":"user-woman","contentType":"ICEBREAKER","content":"coffee-or-tea",'
            '"mediaUrl":null,"isBlurred":false,"icebreaker":{"promptId":"coffee-or-tea",'
            '"question":"Coffee or tea?","optionA":"Coffee","optionB":"Tea","myOptionIndex":null,'
            '"otherOptionIndex":null},"createdAt":"2026-01-01T00:00:00.000Z"}',
            201,
            headers: {'content-type': 'application/json'},
          );
        }
        if (request.url.path.endsWith('/messages')) {
          return http.Response(_emptyMessages, 200, headers: {'content-type': 'application/json'});
        }
        return http.Response(
          '{"matchId":"match-1","expiresAt":null,"isExpired":false,'
          '"firstMessageSent":true,"canSendFirstMessage":true}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: MatchChatScreen(messagingApi: api, matchId: 'match-1', currentUserId: 'user-woman'),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(Icons.quiz_outlined));
    await tester.pumpAndSettle();

    expect(find.text('Coffee or tea?'), findsOneWidget);

    await tester.tap(find.text('Coffee or tea?'));
    await tester.pumpAndSettle();

    expect(sendRequest, isNotNull);
    expect(sendRequest!.body, '{"promptId":"coffee-or-tea"}');
    expect(find.text('Coffee'), findsOneWidget);
    expect(find.text('Tea'), findsOneWidget);
  });

  testWidgets('answering an icebreaker shows my pick while waiting on the other side', (
    tester,
  ) async {
    http.Request? responseRequest;
    final api = MessagingApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.method == 'POST' && request.url.path.endsWith('/icebreaker-response')) {
          responseRequest = request;
          return http.Response(
            '{"id":"m1","senderId":"user-man","contentType":"ICEBREAKER","content":"coffee-or-tea",'
            '"mediaUrl":null,"isBlurred":false,"icebreaker":{"promptId":"coffee-or-tea",'
            '"question":"Coffee or tea?","optionA":"Coffee","optionB":"Tea","myOptionIndex":0,'
            '"otherOptionIndex":null},"createdAt":"2026-01-01T00:00:00.000Z"}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        if (request.url.path.endsWith('/messages')) {
          return http.Response(
            '[{"id":"m1","senderId":"user-man","contentType":"ICEBREAKER","content":"coffee-or-tea",'
            '"mediaUrl":null,"isBlurred":false,"icebreaker":{"promptId":"coffee-or-tea",'
            '"question":"Coffee or tea?","optionA":"Coffee","optionB":"Tea","myOptionIndex":null,'
            '"otherOptionIndex":null},"createdAt":"2026-01-01T00:00:00.000Z"}]',
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response(
          '{"matchId":"match-1","expiresAt":null,"isExpired":false,'
          '"firstMessageSent":true,"canSendFirstMessage":true}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: MatchChatScreen(messagingApi: api, matchId: 'match-1', currentUserId: 'user-woman'),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Coffee'));
    await tester.pumpAndSettle();

    expect(responseRequest, isNotNull);
    expect(responseRequest!.body, '{"optionIndex":0}');
    expect(find.text('You: Coffee'), findsOneWidget);
    expect(find.text('Waiting for their answer...'), findsOneWidget);
  });

  testWidgets('reveals both picks once both people have answered', (tester) async {
    final api = MessagingApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path.endsWith('/messages')) {
          return http.Response(
            '[{"id":"m1","senderId":"user-man","contentType":"ICEBREAKER","content":"coffee-or-tea",'
            '"mediaUrl":null,"isBlurred":false,"icebreaker":{"promptId":"coffee-or-tea",'
            '"question":"Coffee or tea?","optionA":"Coffee","optionB":"Tea","myOptionIndex":1,'
            '"otherOptionIndex":0},"createdAt":"2026-01-01T00:00:00.000Z"}]',
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response(
          '{"matchId":"match-1","expiresAt":null,"isExpired":false,'
          '"firstMessageSent":true,"canSendFirstMessage":true}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: MatchChatScreen(messagingApi: api, matchId: 'match-1', currentUserId: 'user-woman'),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('You: Tea'), findsOneWidget);
    expect(find.text('Them: Coffee'), findsOneWidget);
  });

  testWidgets('extending the match time limit updates the button state', (tester) async {
    http.Request? extendRequest;
    final api = MessagingApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.method == 'POST' && request.url.path == '/matches/match-1/extend') {
          extendRequest = request;
          return http.Response(
            '{"matchId":"match-1","expiresAt":"2026-01-03T00:00:00.000Z",'
            '"isExpired":false,"firstMessageSent":false,"canSendFirstMessage":true,'
            '"canExtend":false}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        if (request.url.path.endsWith('/messages')) {
          return http.Response(_emptyMessages, 200, headers: {'content-type': 'application/json'});
        }
        return http.Response(
          '{"matchId":"match-1","expiresAt":"2026-01-02T00:00:00.000Z",'
          '"isExpired":false,"firstMessageSent":false,"canSendFirstMessage":true,'
          '"canExtend":true}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );

    await tester.pumpWidget(
      MaterialApp(
        home: MatchChatScreen(messagingApi: api, matchId: 'match-1', currentUserId: 'user-woman'),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Extend 24 hours'), findsOneWidget);

    await tester.tap(find.text('Extend 24 hours'));
    await tester.pumpAndSettle();

    expect(extendRequest, isNotNull);
    expect(find.text('Extend 24 hours'), findsNothing);
  });

  testWidgets('records and sends a voice note', (tester) async {
    http.Request? sendRequest;
    final api = MessagingApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path.endsWith('/messages')) {
          return http.Response(_emptyMessages, 200, headers: {'content-type': 'application/json'});
        }
        if (request.method == 'POST' && request.url.path == '/matches/match-1/voice-note') {
          sendRequest = request;
          return http.Response(
            '{"id":"m5","senderId":"user-woman","contentType":"VOICE_NOTE","content":null,'
            '"mediaUrl":"file:///tmp/fake-note.m4a","isBlurred":false,"durationSeconds":2,'
            '"createdAt":"2026-01-01T00:00:00.000Z"}',
            201,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response(
          '{"matchId":"match-1","expiresAt":null,"isExpired":false,'
          '"firstMessageSent":true,"canSendFirstMessage":true}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );
    final recorder = _FakeRecorder();
    final player = _FakePlayer();

    await tester.pumpWidget(
      MaterialApp(
        home: MatchChatScreen(
          messagingApi: api,
          matchId: 'match-1',
          currentUserId: 'user-woman',
          recorder: recorder,
          player: player,
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(Icons.mic_none));
    await tester.pump();
    expect(recorder.started, isTrue);
    expect(find.byIcon(Icons.stop_circle), findsOneWidget);

    await tester.pump(const Duration(seconds: 2));
    await tester.tap(find.byIcon(Icons.stop_circle));
    await tester.pumpAndSettle();

    expect(sendRequest, isNotNull);
    expect(sendRequest!.body, contains('"mediaUrl":"file:///tmp/fake-note.m4a"'));
    expect(find.textContaining('voice note'), findsOneWidget);
  });

  testWidgets('shows an error when microphone permission is denied', (tester) async {
    final api = MessagingApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path.endsWith('/messages')) {
          return http.Response(_emptyMessages, 200, headers: {'content-type': 'application/json'});
        }
        return http.Response(
          '{"matchId":"match-1","expiresAt":null,"isExpired":false,'
          '"firstMessageSent":true,"canSendFirstMessage":true}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );
    final recorder = _FakeRecorder()..granted = false;
    final player = _FakePlayer();

    await tester.pumpWidget(
      MaterialApp(
        home: MatchChatScreen(
          messagingApi: api,
          matchId: 'match-1',
          currentUserId: 'user-woman',
          recorder: recorder,
          player: player,
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byIcon(Icons.mic_none));
    await tester.pump();

    expect(
      find.text('Microphone permission is required to send a voice note.'),
      findsOneWidget,
    );
    expect(recorder.started, isFalse);
  });

  testWidgets('tapping play on a voice note plays it back', (tester) async {
    final api = MessagingApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path.endsWith('/messages')) {
          return http.Response(
            '[{"id":"m1","senderId":"user-man","contentType":"VOICE_NOTE","content":null,'
            '"mediaUrl":"file:///tmp/incoming-note.m4a","isBlurred":false,"durationSeconds":5,'
            '"createdAt":"2026-01-01T00:00:00.000Z"}]',
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        return http.Response(
          '{"matchId":"match-1","expiresAt":null,"isExpired":false,'
          '"firstMessageSent":true,"canSendFirstMessage":true}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );
    final recorder = _FakeRecorder();
    final player = _FakePlayer();

    await tester.pumpWidget(
      MaterialApp(
        home: MatchChatScreen(
          messagingApi: api,
          matchId: 'match-1',
          currentUserId: 'user-woman',
          recorder: recorder,
          player: player,
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('5s voice note'), findsOneWidget);

    await tester.tap(find.byIcon(Icons.play_arrow));
    await tester.pump();

    expect(player.lastPlayedPath, 'file:///tmp/incoming-note.m4a');
  });
}
