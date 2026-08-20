import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/profile/video_snippet_api.dart';

void main() {
  group('VideoSnippetApi.fetchVideoSnippet', () {
    test('sends the bearer token and parses the result', () async {
      final api = VideoSnippetApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.method, 'GET');
          expect(request.url.path, '/profile/video-snippet');
          expect(request.headers['Authorization'], 'Bearer a-jwt');
          return http.Response(
            '{"url":"file:///tmp/snippet.mp4"}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final result = await api.fetchVideoSnippet();

      expect(result.url, 'file:///tmp/snippet.mp4');
    });
  });

  group('VideoSnippetApi.setVideoSnippet', () {
    test('sends the bearer token and payload, and parses the result', () async {
      final api = VideoSnippetApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.method, 'PUT');
          expect(request.url.path, '/profile/video-snippet');
          expect(request.headers['Authorization'], 'Bearer a-jwt');
          expect(request.body, '{"url":"file:///tmp/snippet.mp4"}');
          return http.Response(
            '{"url":"file:///tmp/snippet.mp4"}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final result = await api.setVideoSnippet(url: 'file:///tmp/snippet.mp4');

      expect(result.url, 'file:///tmp/snippet.mp4');
    });

    test('throws VideoSnippetApiException on a non-200 response', () async {
      final api = VideoSnippetApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => http.Response(
            '{"message":"url must be a string"}',
            400,
            headers: {'content-type': 'application/json'},
          ),
        ),
      );

      expect(
        () => api.setVideoSnippet(url: ''),
        throwsA(isA<VideoSnippetApiException>()),
      );
    });
  });

  group('VideoSnippetApi.clearVideoSnippet', () {
    test('sends a DELETE request and parses the cleared result', () async {
      final api = VideoSnippetApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.method, 'DELETE');
          expect(request.url.path, '/profile/video-snippet');
          return http.Response(
            '{"url":null}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final result = await api.clearVideoSnippet();

      expect(result.url, isNull);
    });
  });
}
