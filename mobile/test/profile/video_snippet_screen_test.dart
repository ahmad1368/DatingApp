import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/profile/video_picker_controller.dart';
import 'package:mobile/profile/video_snippet_api.dart';
import 'package:mobile/profile/video_snippet_screen.dart';

class _FakeVideoPicker implements VideoPickerController {
  String? pickedPath = 'file:///tmp/fake-snippet.mp4';

  @override
  Future<String?> pickVideo() async => pickedPath;
}

void main() {
  testWidgets('picks and saves a video snippet', (tester) async {
    http.Request? capturedRequest;
    final api = VideoSnippetApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.method == 'GET') {
          return http.Response('{"url":null}', 200, headers: {'content-type': 'application/json'});
        }
        capturedRequest = request;
        return http.Response(
          '{"url":"file:///tmp/fake-snippet.mp4"}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );
    final picker = _FakeVideoPicker();

    await tester.pumpWidget(
      MaterialApp(home: VideoSnippetScreen(videoSnippetApi: api, picker: picker)),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.widgetWithText(ElevatedButton, 'Choose video'));
    await tester.pump();

    expect(find.text('Selected: file:///tmp/fake-snippet.mp4'), findsOneWidget);

    await tester.tap(find.widgetWithText(ElevatedButton, 'Save'));
    await tester.pumpAndSettle();

    expect(capturedRequest, isNotNull);
    expect(capturedRequest!.method, 'PUT');
    expect(capturedRequest!.body, '{"url":"file:///tmp/fake-snippet.mp4"}');
    expect(find.text('Video snippet saved.'), findsOneWidget);
  });

  testWidgets('shows the existing snippet and removes it', (tester) async {
    http.Request? deleteRequest;
    final api = VideoSnippetApi(
      accessToken: 'a-jwt',
      client: MockClient((request) async {
        if (request.method == 'GET') {
          return http.Response(
            '{"url":"file:///tmp/existing.mp4"}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }
        deleteRequest = request;
        return http.Response('{"url":null}', 200, headers: {'content-type': 'application/json'});
      }),
    );
    final picker = _FakeVideoPicker();

    await tester.pumpWidget(
      MaterialApp(home: VideoSnippetScreen(videoSnippetApi: api, picker: picker)),
    );
    await tester.pumpAndSettle();

    expect(find.text('Current: file:///tmp/existing.mp4'), findsOneWidget);

    await tester.tap(find.widgetWithText(OutlinedButton, 'Remove'));
    await tester.pumpAndSettle();

    expect(deleteRequest, isNotNull);
    expect(deleteRequest!.method, 'DELETE');
    expect(find.text('Video snippet removed.'), findsOneWidget);
    expect(find.textContaining('Current:'), findsNothing);
  });
}
