import 'dart:async';

import 'package:flutter/material.dart';

import 'profile_prompts_api.dart';
import 'voice_player_controller.dart';
import 'voice_recorder_controller.dart';

const int _maxRecordingSeconds = 60;

/// Lets a user record a short voice answer to one of a fixed set of profile
/// prompts, giving potential matches an authentic preview of their voice and
/// personality.
class VoicePromptsScreen extends StatefulWidget {
  VoicePromptsScreen({
    super.key,
    required this.profilePromptsApi,
    VoiceRecorderController? recorder,
    VoicePlayerController? player,
  })  : recorder = recorder ?? DeviceVoiceRecorderController(),
        player = player ?? DeviceVoicePlayerController();

  final ProfilePromptsApi profilePromptsApi;
  final VoiceRecorderController recorder;
  final VoicePlayerController player;

  @override
  State<VoicePromptsScreen> createState() => _VoicePromptsScreenState();
}

class _VoicePromptsScreenState extends State<VoicePromptsScreen> {
  List<ProfilePrompt> _prompts = [];
  Map<String, VoicePromptAnswer> _answersByPromptId = {};
  bool _isLoading = true;
  String? _errorText;

  String? _recordingPromptId;
  Timer? _timer;
  int _elapsedSeconds = 0;
  bool _isBusy = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _isLoading = true;
      _errorText = null;
    });
    try {
      final results = await Future.wait([
        widget.profilePromptsApi.fetchPrompts(),
        widget.profilePromptsApi.fetchMyAnswers(),
      ]);
      setState(() {
        _prompts = results[0] as List<ProfilePrompt>;
        _answersByPromptId = {
          for (final answer in results[1] as List<VoicePromptAnswer>) answer.promptId: answer,
        };
      });
    } on ProfilePromptsApiException catch (e) {
      setState(() => _errorText = e.message);
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  Future<void> _startRecording(String promptId) async {
    setState(() => _errorText = null);

    final hasPermission = await widget.recorder.hasPermission();
    if (!hasPermission) {
      setState(() => _errorText = 'Microphone permission is required to record an answer.');
      return;
    }

    await widget.recorder.start();
    setState(() {
      _recordingPromptId = promptId;
      _elapsedSeconds = 0;
    });

    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      setState(() => _elapsedSeconds += 1);
      if (_elapsedSeconds >= _maxRecordingSeconds) {
        _stopAndSave();
      }
    });
  }

  Future<void> _stopAndSave() async {
    _timer?.cancel();
    final promptId = _recordingPromptId;
    final path = await widget.recorder.stop();
    final duration = _elapsedSeconds;
    setState(() => _recordingPromptId = null);

    if (promptId == null || path == null || duration < 1) {
      return;
    }

    setState(() => _isBusy = true);
    try {
      final answer = await widget.profilePromptsApi.recordAnswer(
        promptId: promptId,
        audioUrl: path,
        durationSeconds: duration,
      );
      setState(() => _answersByPromptId = {..._answersByPromptId, promptId: answer});
    } on ProfilePromptsApiException catch (e) {
      setState(() => _errorText = e.message);
    } finally {
      if (mounted) {
        setState(() => _isBusy = false);
      }
    }
  }

  Future<void> _play(VoicePromptAnswer answer) async {
    await widget.player.play(answer.audioUrl);
  }

  Future<void> _delete(String promptId) async {
    setState(() => _errorText = null);
    try {
      await widget.profilePromptsApi.deleteAnswer(promptId);
      setState(() {
        _answersByPromptId = {..._answersByPromptId}..remove(promptId);
      });
    } on ProfilePromptsApiException catch (e) {
      setState(() => _errorText = e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Voice Prompts')),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                if (_errorText != null) ...[
                  Text(_errorText!, style: const TextStyle(color: Colors.red)),
                  const SizedBox(height: 12),
                ],
                for (final prompt in _prompts) _buildPromptTile(prompt),
              ],
            ),
    );
  }

  Widget _buildPromptTile(ProfilePrompt prompt) {
    final answer = _answersByPromptId[prompt.id];
    final isRecording = _recordingPromptId == prompt.id;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(prompt.question, style: const TextStyle(fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            if (isRecording)
              Row(
                children: [
                  Text('Recording... $_elapsedSeconds/$_maxRecordingSeconds s'),
                  const Spacer(),
                  ElevatedButton(onPressed: _stopAndSave, child: const Text('Stop')),
                ],
              )
            else if (answer != null)
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Text('${answer.durationSeconds}s answer'),
                      const Spacer(),
                      IconButton(
                        icon: const Icon(Icons.play_arrow),
                        onPressed: _isBusy ? null : () => _play(answer),
                      ),
                      IconButton(
                        icon: const Icon(Icons.mic),
                        tooltip: 'Re-record',
                        onPressed: _isBusy ? null : () => _startRecording(prompt.id),
                      ),
                      IconButton(
                        icon: const Icon(Icons.delete_outline),
                        onPressed: _isBusy ? null : () => _delete(prompt.id),
                      ),
                    ],
                  ),
                  if (answer.transcript != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: Text(
                        answer.transcript!,
                        style: const TextStyle(fontStyle: FontStyle.italic, color: Colors.grey),
                      ),
                    ),
                ],
              )
            else
              ElevatedButton(
                onPressed: _isBusy || _recordingPromptId != null
                    ? null
                    : () => _startRecording(prompt.id),
                child: const Text('Record answer'),
              ),
          ],
        ),
      ),
    );
  }
}
