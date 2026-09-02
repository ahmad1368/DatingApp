import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/profile/profile_poll_api.dart';

http.Response _jsonResponse(String body, int status) =>
    http.Response(body, status, headers: {'content-type': 'application/json'});

void main() {
  group('ProfilePollApi.setPoll', () {
    test('sends the question and options and parses the created poll', () async {
      http.Request? putRequest;
      final api = ProfilePollApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          putRequest = request;
          return _jsonResponse(
            '{"question":"Coffee or tea?","options":["Coffee","Tea"],'
            '"myOptionIndex":null,"voteCounts":[0,0],"totalVotes":0}',
            200,
          );
        }),
      );

      final poll = await api.setPoll(question: 'Coffee or tea?', options: ['Coffee', 'Tea']);

      expect(putRequest!.method, 'PUT');
      expect(putRequest!.url.path, '/profile/poll');
      expect(putRequest!.body, '{"question":"Coffee or tea?","options":["Coffee","Tea"]}');
      expect(poll.question, 'Coffee or tea?');
      expect(poll.options, ['Coffee', 'Tea']);
    });

    test('throws ProfilePollApiException on a non-200 response', () async {
      final api = ProfilePollApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => _jsonResponse('{"message":"A poll needs between 2 and 6 options."}', 400),
        ),
      );

      expect(
        () => api.setPoll(question: 'Q', options: ['One']),
        throwsA(isA<ProfilePollApiException>()),
      );
    });
  });

  group('ProfilePollApi.clearPoll', () {
    test('sends a DELETE to the poll endpoint', () async {
      http.Request? deleteRequest;
      final api = ProfilePollApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          deleteRequest = request;
          return _jsonResponse('{"cleared":true}', 200);
        }),
      );

      await api.clearPoll();

      expect(deleteRequest!.method, 'DELETE');
      expect(deleteRequest!.url.path, '/profile/poll');
    });
  });

  group('ProfilePollApi.fetchPoll', () {
    test("parses another user's poll from the caller's perspective", () async {
      final api = ProfilePollApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.url.path, '/profile/poll/user-2');
          return _jsonResponse(
            '{"question":"Coffee or tea?","options":["Coffee","Tea","Neither"],'
            '"myOptionIndex":1,"voteCounts":[2,5,1],"totalVotes":8}',
            200,
          );
        }),
      );

      final poll = await api.fetchPoll('user-2');

      expect(poll.hasPoll, isTrue);
      expect(poll.myOptionIndex, 1);
      expect(poll.voteCounts, [2, 5, 1]);
      expect(poll.totalVotes, 8);
    });

    test('parses a user with no active poll', () async {
      final api = ProfilePollApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => _jsonResponse(
            '{"question":null,"options":[],"myOptionIndex":null,"voteCounts":[],"totalVotes":0}',
            200,
          ),
        ),
      );

      final poll = await api.fetchPoll('user-2');

      expect(poll.hasPoll, isFalse);
    });

    test('throws ProfilePollApiException on a non-200 response', () async {
      final api = ProfilePollApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async => _jsonResponse('{"message":"User not found."}', 404)),
      );

      expect(() => api.fetchPoll('user-2'), throwsA(isA<ProfilePollApiException>()));
    });
  });

  group('ProfilePollApi.vote', () {
    test('sends the target and option index and parses the updated poll', () async {
      http.Request? postRequest;
      final api = ProfilePollApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          postRequest = request;
          return _jsonResponse(
            '{"question":"Coffee or tea?","options":["Coffee","Tea"],'
            '"myOptionIndex":0,"voteCounts":[1,0],"totalVotes":1}',
            200,
          );
        }),
      );

      final poll = await api.vote(targetUserId: 'user-2', optionIndex: 0);

      expect(postRequest!.method, 'POST');
      expect(postRequest!.url.path, '/profile/poll/vote');
      expect(postRequest!.body, '{"targetUserId":"user-2","optionIndex":0}');
      expect(poll.myOptionIndex, 0);
    });

    test('throws ProfilePollApiException when voting on your own poll', () async {
      final api = ProfilePollApi(
        accessToken: 'a-jwt',
        client: MockClient(
          (request) async => _jsonResponse('{"message":"You cannot vote on your own poll."}', 400),
        ),
      );

      expect(
        () => api.vote(targetUserId: 'user-1', optionIndex: 0),
        throwsA(isA<ProfilePollApiException>()),
      );
    });
  });

  group('ProfilePollApi.fetchVoters', () {
    test('parses the list of voters', () async {
      final api = ProfilePollApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async {
          expect(request.url.path, '/profile/poll/voters');
          return _jsonResponse(
            '[{"voterId":"user-2","voterName":"Jane","voterPhotoUrl":null,'
            '"optionIndex":1,"votedAt":"2026-01-01T00:00:00.000Z"}]',
            200,
          );
        }),
      );

      final voters = await api.fetchVoters();

      expect(voters, hasLength(1));
      expect(voters.first.voterName, 'Jane');
      expect(voters.first.optionIndex, 1);
    });

    test('throws ProfilePollApiException on a non-200 response', () async {
      final api = ProfilePollApi(
        accessToken: 'a-jwt',
        client: MockClient((request) async => http.Response('', 500)),
      );

      expect(() => api.fetchVoters(), throwsA(isA<ProfilePollApiException>()));
    });
  });
}
