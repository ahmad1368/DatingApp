import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/profile/profile_poll_api.dart';
import 'package:mobile/profile/profile_poll_screen.dart';

http.Response _jsonResponse(String body, int status) =>
    http.Response(body, status, headers: {'content-type': 'application/json'});

const _emptyPoll =
    '{"question":null,"options":[],"myOptionIndex":null,"voteCounts":[],"totalVotes":0}';

void main() {
  testWidgets('shows an empty form and no-votes state when there is no existing poll', (tester) async {
    final api = ProfilePollApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/profile/poll/voters') {
          return _jsonResponse('[]', 200);
        }
        return _jsonResponse(_emptyPoll, 200);
      }),
    );

    await tester.pumpWidget(
      MaterialApp(home: ProfilePollScreen(profilePollApi: api, currentUserId: 'user-1')),
    );
    await tester.pumpAndSettle();

    expect(find.text('No votes yet.'), findsOneWidget);
    expect(find.byType(TextField), findsNWidgets(3)); // question + 2 default options
  });

  testWidgets('pre-fills the form with an existing poll and lists voters', (tester) async {
    final api = ProfilePollApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/profile/poll/voters') {
          return _jsonResponse(
            '[{"voterId":"user-2","voterName":"Jane","voterPhotoUrl":null,'
            '"optionIndex":1,"votedAt":"2026-01-01T00:00:00.000Z"}]',
            200,
          );
        }
        return _jsonResponse(
          '{"question":"Coffee or tea?","options":["Coffee","Tea"],'
          '"myOptionIndex":null,"voteCounts":[1,3],"totalVotes":4}',
          200,
        );
      }),
    );

    await tester.pumpWidget(
      MaterialApp(home: ProfilePollScreen(profilePollApi: api, currentUserId: 'user-1')),
    );
    await tester.pumpAndSettle();

    expect(find.widgetWithText(TextField, 'Coffee'), findsOneWidget);
    expect(find.widgetWithText(TextField, 'Tea'), findsOneWidget);
    expect(find.text('Jane'), findsOneWidget);
    expect(find.text('Picked option 2'), findsOneWidget);
  });

  testWidgets('saving a poll sends the question and options', (tester) async {
    http.Request? putRequest;
    final api = ProfilePollApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/profile/poll/voters') {
          return _jsonResponse('[]', 200);
        }
        if (request.method == 'PUT') {
          putRequest = request;
          return _jsonResponse(
            '{"question":"Beach or mountains?","options":["Beach","Mountains"],'
            '"myOptionIndex":null,"voteCounts":[0,0],"totalVotes":0}',
            200,
          );
        }
        return _jsonResponse(_emptyPoll, 200);
      }),
    );

    await tester.pumpWidget(
      MaterialApp(home: ProfilePollScreen(profilePollApi: api, currentUserId: 'user-1')),
    );
    await tester.pumpAndSettle();

    await tester.enterText(find.widgetWithText(TextField, 'Question'), 'Beach or mountains?');
    await tester.enterText(find.widgetWithText(TextField, 'Option 1'), 'Beach');
    await tester.enterText(find.widgetWithText(TextField, 'Option 2'), 'Mountains');
    await tester.tap(find.text('Save poll'));
    await tester.pumpAndSettle();

    expect(putRequest, isNotNull);
    expect(putRequest!.body, '{"question":"Beach or mountains?","options":["Beach","Mountains"]}');
    expect(find.text('Poll saved to your profile.'), findsOneWidget);
  });

  testWidgets('clearing the poll empties the form', (tester) async {
    http.Request? deleteRequest;
    final api = ProfilePollApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.url.path == '/profile/poll/voters') {
          return _jsonResponse('[]', 200);
        }
        if (request.method == 'DELETE') {
          deleteRequest = request;
          return _jsonResponse('{"cleared":true}', 200);
        }
        return _jsonResponse(
          '{"question":"Coffee or tea?","options":["Coffee","Tea"],'
          '"myOptionIndex":null,"voteCounts":[0,0],"totalVotes":0}',
          200,
        );
      }),
    );

    await tester.pumpWidget(
      MaterialApp(home: ProfilePollScreen(profilePollApi: api, currentUserId: 'user-1')),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Remove poll'));
    await tester.pumpAndSettle();

    expect(deleteRequest, isNotNull);
    expect(find.text('Poll removed from your profile.'), findsOneWidget);
    expect(find.widgetWithText(TextField, 'Coffee'), findsNothing);
  });
}
