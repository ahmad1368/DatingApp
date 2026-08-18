import 'package:flutter/material.dart';
import 'package:sign_in_with_apple/sign_in_with_apple.dart';

import 'auth_api.dart';

class AppleSignInButton extends StatefulWidget {
  const AppleSignInButton({super.key, required this.authApi, required this.onVerified});

  final AuthApi authApi;
  final ValueChanged<AuthResult> onVerified;

  @override
  State<AppleSignInButton> createState() => _AppleSignInButtonState();
}

class _AppleSignInButtonState extends State<AppleSignInButton> {
  bool _isSubmitting = false;
  String? _errorText;

  Future<void> _handleSignIn() async {
    setState(() {
      _isSubmitting = true;
      _errorText = null;
    });
    try {
      final credential = await SignInWithApple.getAppleIDCredential(
        scopes: const [
          AppleIDAuthorizationScopes.email,
          AppleIDAuthorizationScopes.fullName,
        ],
      );
      final identityToken = credential.identityToken;
      if (identityToken == null) {
        throw AuthApiException('Apple sign-in did not return an identity token.');
      }
      // Apple only includes the user's name on their first authorization.
      final fullName = [credential.givenName, credential.familyName]
          .whereType<String>()
          .where((part) => part.isNotEmpty)
          .join(' ');
      final result = await widget.authApi.loginWithApple(
        identityToken,
        fullName: fullName.isEmpty ? null : fullName,
      );
      widget.onVerified(result);
    } on AuthApiException catch (e) {
      setState(() => _errorText = e.message);
    } on SignInWithAppleException {
      setState(() => _errorText = 'Apple sign-in failed. Please try again.');
    } finally {
      if (mounted) {
        setState(() => _isSubmitting = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        OutlinedButton.icon(
          onPressed: _isSubmitting ? null : _handleSignIn,
          icon: _isSubmitting
              ? const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2),
                )
              : const Icon(Icons.apple),
          label: const Text('Continue with Apple'),
        ),
        if (_errorText != null) ...[
          const SizedBox(height: 8),
          Text(_errorText!, style: const TextStyle(color: Colors.red)),
        ],
      ],
    );
  }
}
