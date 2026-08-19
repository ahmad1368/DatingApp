import 'dart:async';

import 'package:flutter/material.dart';

import 'voice_intro_api.dart';
import 'voice_player_controller.dart';
import 'voice_recorder_controller.dart';

const int _maxRecordingSeconds = 30;

class VoiceIntroScreen extends StatefulWidget {
  VoiceIntroScreen({
    super.key,
    required this.voiceIntroApi,
    VoiceRecorderController? recorder,
    VoicePlayerController? player,
  })  : recorder = recorder ?? DeviceVoiceRecorderController(),
        player = player ?? DeviceVoicePlayerController();

  final VoiceIntroApi voiceIntroApi;
  final VoiceRecorderController recorder;
  final VoicePlayerController player;

  @override
  State<VoiceIntroScreen> createState() => _VoiceIntroScreenState();
}

class _VoiceIntroScreenState extends State<VoiceIntroScreen> {
  Timer? _timer;
  bool _isRecording = false;
  bool _isBusy = false;
  int _elapsedSeconds = 0;
  String? _recordedPath;
  int? _recordedDurationSeconds;
  String? _errorText;
  String? _statusText;

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _startRecording() async {
    setState(() {
      _errorText = null;
      _statusText = null;
    });

    final hasPermission = await widget.recorder.hasPermission();
    if (!hasPermission) {
      setState(() => _errorText = 'Microphone permission is required to record a voice intro.');
      return;
    }

    await widget.recorder.start();
    setState(() {
      _isRecording = true;
      _elapsedSeconds = 0;
      _recordedPath = null;
      _recordedDurationSeconds = null;
    });

    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      setState(() => _elapsedSeconds += 1);
      if (_elapsedSeconds >= _maxRecordingSeconds) {
        _stopRecording();
      }
    });
  }

  Future<void> _stopRecording() async {
    _timer?.cancel();
    final path = await widget.recorder.stop();
    setState(() {
      _isRecording = false;
      _recordedPath = path;
      _recordedDurationSeconds = _elapsedSeconds;
    });
  }

  Future<void> _playPreview() async {
    final path = _recordedPath;
    if (path == null) {
      return;
    }
    await widget.player.play(path);
  }

  Future<void> _save() async {
    final path = _recordedPath;
    final duration = _recordedDurationSeconds;
    if (path == null || duration == null) {
      return;
    }
    setState(() {
      _isBusy = true;
      _errorText = null;
      _statusText = null;
    });
    try {
      await widget.voiceIntroApi.setVoiceIntro(url: path, durationSeconds: duration);
      setState(() => _statusText = 'Voice intro saved.');
    } on VoiceIntroApiException catch (e) {
      setState(() => _errorText = e.message);
    } finally {
      if (mounted) {
        setState(() => _isBusy = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Voice intro')),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              _isRecording
                  ? 'Recording... $_elapsedSeconds/$_maxRecordingSeconds s'
                  : 'Record up to $_maxRecordingSeconds seconds to introduce yourself.',
            ),
            const SizedBox(height: 16),
            if (!_isRecording)
              ElevatedButton(
                onPressed: _isBusy ? null : _startRecording,
                child: const Text('Record'),
              )
            else
              ElevatedButton(
                onPressed: _stopRecording,
                child: const Text('Stop'),
              ),
            if (_recordedPath != null && !_isRecording) ...[
              const SizedBox(height: 16),
              Text('Recorded: $_recordedDurationSeconds s'),
              const SizedBox(height: 8),
              OutlinedButton(
                onPressed: _isBusy ? null : _playPreview,
                child: const Text('Play preview'),
              ),
              const SizedBox(height: 8),
              ElevatedButton(
                onPressed: _isBusy ? null : _save,
                child: _isBusy
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Text('Save'),
              ),
            ],
            if (_errorText != null) ...[
              const SizedBox(height: 16),
              Text(_errorText!, style: const TextStyle(color: Colors.red)),
            ],
            if (_statusText != null) ...[
              const SizedBox(height: 16),
              Text(_statusText!),
            ],
          ],
        ),
      ),
    );
  }
}
