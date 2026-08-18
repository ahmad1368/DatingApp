import 'package:flutter/material.dart';
import 'package:google_sign_in/google_sign_in.dart';

import 'auth_api.dart';

class GoogleSignInButton extends StatefulWidget {
  const GoogleSignInButton({super.key, required this.authApi, required this.onVerified});

  final AuthApi authApi;
  final ValueChanged<AuthResult> onVerified;

  @override
  State<GoogleSignInButton> createState() => _GoogleSignInButtonState();
}

class _GoogleSignInButtonState extends State<GoogleSignInButton> {
  final GoogleSignIn _googleSignIn = GoogleSignIn(scopes: const ['email']);
  bool _isSubmitting = false;
  String? _errorText;

  Future<void> _handleSignIn() async {
    setState(() {
      _isSubmitting = true;
      _errorText = null;
    });
    try {
      final account = await _googleSignIn.signIn();
      if (account == null) {
        return;
      }
      final googleAuth = await account.authentication;
      final idToken = googleAuth.idToken;
      if (idToken == null) {
        throw AuthApiException('Google sign-in did not return an ID token.');
      }
      final result = await widget.authApi.loginWithGoogle(idToken);
      widget.onVerified(result);
    } on AuthApiException catch (e) {
      setState(() => _errorText = e.message);
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
              : const Icon(Icons.g_mobiledata),
          label: const Text('Continue with Google'),
        ),
        if (_errorText != null) ...[
          const SizedBox(height: 8),
          Text(_errorText!, style: const TextStyle(color: Colors.red)),
        ],
      ],
    );
  }
}
