import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import 'verification_api.dart';

const Map<String, String> _gestureInstructions = {
  'SMILE': 'Smile for the camera',
  'TURN_HEAD_LEFT': 'Turn your head to the left',
  'TURN_HEAD_RIGHT': 'Turn your head to the right',
  'RAISE_RIGHT_HAND': 'Raise your right hand',
  'WINK': 'Wink at the camera',
};

class SelfieVerificationScreen extends StatefulWidget {
  const SelfieVerificationScreen({super.key, required this.verificationApi});

  final VerificationApi verificationApi;

  @override
  State<SelfieVerificationScreen> createState() => _SelfieVerificationScreenState();
}

const Map<String, String> _reverificationReasons = {
  'PHOTO_CHANGED': 'Your profile photo has changed since you last verified. '
      'Please re-verify to keep your verified badge.',
  'PERIODIC': 'It\'s been a while since you last verified. '
      'Please re-verify to keep your verified badge.',
};

class _SelfieVerificationScreenState extends State<SelfieVerificationScreen> {
  final ImagePicker _imagePicker = ImagePicker();

  VerificationChallenge? _challenge;
  VerificationResult? _result;
  VerificationStatus? _status;
  bool _isBusy = false;
  String? _errorText;

  @override
  void initState() {
    super.initState();
    _loadStatus();
  }

  Future<void> _loadStatus() async {
    try {
      final status = await widget.verificationApi.fetchStatus();
      if (mounted) {
        setState(() => _status = status);
      }
    } catch (_) {
      // Best-effort: the reverification banner just stays hidden if this fails.
    }
  }

  Future<void> _requestChallenge() async {
    setState(() {
      _isBusy = true;
      _errorText = null;
      _result = null;
    });
    try {
      final challenge = await widget.verificationApi.requestChallenge();
      setState(() => _challenge = challenge);
    } on VerificationApiException catch (e) {
      setState(() => _errorText = e.message);
    } finally {
      if (mounted) {
        setState(() => _isBusy = false);
      }
    }
  }

  Future<void> _takeSelfieAndSubmit() async {
    final challenge = _challenge;
    if (challenge == null) {
      return;
    }
    setState(() {
      _isBusy = true;
      _errorText = null;
    });
    try {
      final photo = await _imagePicker.pickImage(
        source: ImageSource.camera,
        preferredCameraDevice: CameraDevice.front,
      );
      if (photo == null) {
        return;
      }
      final bytes = await photo.readAsBytes();
      final result = await widget.verificationApi.submitSelfie(
        challengeId: challenge.challengeId,
        selfieImageBase64: base64Encode(bytes),
      );
      setState(() {
        _result = result;
        _challenge = null;
        if (result.isVerified) {
          _status = null;
        }
      });
    } on VerificationApiException catch (e) {
      setState(() => _errorText = e.message);
    } finally {
      if (mounted) {
        setState(() => _isBusy = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final challenge = _challenge;
    final result = _result;
    final status = _status;

    return Scaffold(
      appBar: AppBar(title: const Text('Verify your profile')),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (status != null && status.reverificationDue && result == null) ...[
              Text(
                _reverificationReasons[status.reverificationReason] ??
                    'Please re-verify to keep your verified badge.',
                style: const TextStyle(fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 12),
            ],
            if (result != null)
              Text(
                result.isVerified
                    ? 'You\'re verified! A blue tick has been added to your profile.'
                    : 'We couldn\'t verify your selfie against your profile photo. Please try again.',
              )
            else if (challenge != null)
              Text(_gestureInstructions[challenge.gesture] ?? 'Follow the on-screen instruction')
            else
              const Text('Start verification to request a live selfie challenge.'),
            if (_errorText != null) ...[
              const SizedBox(height: 8),
              Text(_errorText!, style: const TextStyle(color: Colors.red)),
            ],
            const SizedBox(height: 16),
            if (challenge == null)
              ElevatedButton(
                onPressed: _isBusy ? null : _requestChallenge,
                child: const Text('Start verification'),
              )
            else
              ElevatedButton(
                onPressed: _isBusy ? null : _takeSelfieAndSubmit,
                child: const Text('Take selfie'),
              ),
          ],
        ),
      ),
    );
  }
}
