import 'package:flutter/material.dart';

import 'auth_api.dart';
import 'otp_verify_screen.dart';

/// E.164 international phone numbers: a leading '+', then 8-15 digits total.
final RegExp _e164Pattern = RegExp(r'^\+[1-9]\d{7,14}$');

class PhoneEntryScreen extends StatefulWidget {
  const PhoneEntryScreen({super.key, required this.authApi, required this.onVerified});

  final AuthApi authApi;
  final ValueChanged<AuthResult> onVerified;

  @override
  State<PhoneEntryScreen> createState() => _PhoneEntryScreenState();
}

class _PhoneEntryScreenState extends State<PhoneEntryScreen> {
  final _formKey = GlobalKey<FormState>();
  final _phoneController = TextEditingController();
  bool _isSubmitting = false;
  String? _errorText;

  @override
  void dispose() {
    _phoneController.dispose();
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
    final phoneNumber = _phoneController.text.trim();
    try {
      await widget.authApi.requestOtp(phoneNumber);
      if (!mounted) return;
      await Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => OtpVerifyScreen(
            phoneNumber: phoneNumber,
            authApi: widget.authApi,
            onVerified: widget.onVerified,
          ),
        ),
      );
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
      appBar: AppBar(title: const Text('Sign in')),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text('Enter your phone number with country code, e.g. +14155552671'),
              const SizedBox(height: 16),
              TextFormField(
                controller: _phoneController,
                keyboardType: TextInputType.phone,
                decoration: const InputDecoration(labelText: 'Phone number'),
                validator: (value) {
                  final trimmed = value?.trim() ?? '';
                  if (!_e164Pattern.hasMatch(trimmed)) {
                    return 'Enter a valid international phone number (e.g. +14155552671)';
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
                    : const Text('Send code'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
