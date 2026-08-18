import 'package:flutter/material.dart';

import 'auth_api.dart';

class OtpVerifyScreen extends StatefulWidget {
  const OtpVerifyScreen({
    super.key,
    required this.phoneNumber,
    required this.authApi,
    required this.onVerified,
  });

  final String phoneNumber;
  final AuthApi authApi;
  final ValueChanged<AuthResult> onVerified;

  @override
  State<OtpVerifyScreen> createState() => _OtpVerifyScreenState();
}

class _OtpVerifyScreenState extends State<OtpVerifyScreen> {
  final _formKey = GlobalKey<FormState>();
  final _codeController = TextEditingController();
  bool _isSubmitting = false;
  String? _errorText;

  @override
  void dispose() {
    _codeController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) {
      return;
    }
    setState(() {
      _isSubmitting = true;
      _errorText = null;
    });
    try {
      final result = await widget.authApi.verifyOtp(
        widget.phoneNumber,
        _codeController.text.trim(),
      );
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
    return Scaffold(
      appBar: AppBar(title: const Text('Enter verification code')),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('We sent a code to ${widget.phoneNumber}'),
              const SizedBox(height: 16),
              TextFormField(
                controller: _codeController,
                keyboardType: TextInputType.number,
                maxLength: 8,
                decoration: const InputDecoration(labelText: 'OTP code'),
                validator: (value) {
                  if (value == null || value.trim().length < 4) {
                    return 'Enter the code you received';
                  }
                  return null;
                },
              ),
              if (_errorText != null) ...[
                const SizedBox(height: 8),
                Text(_errorText!, style: const TextStyle(color: Colors.red)),
              ],
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: _isSubmitting ? null : _submit,
                child: _isSubmitting
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Text('Verify'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
