import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:mobile/auth/auth_api.dart';

void main() {
  group('AuthApi.loginWithGoogle', () {
    test('returns an AuthResult on success', () async {
      final authApi = AuthApi(
        client: MockClient((request) async {
          expect(request.url.path, '/auth/google');
          expect(request.body, '{"idToken":"a-google-id-token"}');
          return http.Response(
            '{"accessToken":"jwt-token","user":{"id":"user-1","email":"jane@example.com","name":"Jane Doe","avatarUrl":"https://example.com/a.png"}}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final result = await authApi.loginWithGoogle('a-google-id-token');

      expect(result.accessToken, 'jwt-token');
      expect(result.userId, 'user-1');
      expect(result.email, 'jane@example.com');
      expect(result.name, 'Jane Doe');
      expect(result.phoneNumber, isNull);
    });

    test('throws AuthApiException when the backend rejects the token', () async {
      final authApi = AuthApi(
        client: MockClient(
          (request) async => http.Response(
            '{"message":"Unable to verify Google account."}',
            401,
            headers: {'content-type': 'application/json'},
          ),
        ),
      );

      expect(
        () => authApi.loginWithGoogle('bad-token'),
        throwsA(isA<AuthApiException>()),
      );
    });
  });

  group('AuthApi.loginWithApple', () {
    test('sends the identity token and full name, and parses the result', () async {
      final authApi = AuthApi(
        client: MockClient((request) async {
          expect(request.url.path, '/auth/apple');
          expect(
            request.body,
            '{"identityToken":"an-apple-identity-token","fullName":"Jane Doe"}',
          );
          return http.Response(
            '{"accessToken":"jwt-token","user":{"id":"user-1","email":"jane@privaterelay.appleid.com","name":"Jane Doe","isPrivateEmail":true}}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      final result = await authApi.loginWithApple(
        'an-apple-identity-token',
        fullName: 'Jane Doe',
      );

      expect(result.accessToken, 'jwt-token');
      expect(result.userId, 'user-1');
      expect(result.email, 'jane@privaterelay.appleid.com');
      expect(result.isPrivateEmail, isTrue);
    });

    test('omits fullName from the request when not provided', () async {
      final authApi = AuthApi(
        client: MockClient((request) async {
          expect(request.body, '{"identityToken":"an-apple-identity-token"}');
          return http.Response(
            '{"accessToken":"jwt-token","user":{"id":"user-1","email":null,"name":null,"isPrivateEmail":false}}',
            200,
            headers: {'content-type': 'application/json'},
          );
        }),
      );

      await authApi.loginWithApple('an-apple-identity-token');
    });

    test('throws AuthApiException when the backend rejects the token', () async {
      final authApi = AuthApi(
        client: MockClient(
          (request) async => http.Response(
            '{"message":"Unable to verify Apple ID token."}',
            401,
            headers: {'content-type': 'application/json'},
          ),
        ),
      );

      expect(
        () => authApi.loginWithApple('bad-token'),
        throwsA(isA<AuthApiException>()),
      );
    });
  });
}
