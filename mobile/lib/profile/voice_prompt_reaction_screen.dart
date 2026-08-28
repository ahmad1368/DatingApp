import 'dart:async';

import 'package:flutter/material.dart';

import 'profile_prompts_api.dart';
import 'voice_player_controller.dart';
import 'voice_recorder_controller.dart';

const int _maxReplySeconds = 60;

/// Shows another user's voice prompt answers and lets the viewer react to
/// any of them with a text comment, a recorded audio reply, or both - a
/// direct, targeted counterpart to a generic profile like. See
/// ProfilePromptsApi.reactToVoicePrompt.
class VoicePromptReactionScreen extends StatefulWidget {
  VoicePromptReactionScreen({
    super.key,
    required this.profilePromptsApi,
    required this.otherUserId,
    VoiceRecorderController? recorder,
    VoicePlayerController? player,
  })  : recorder = recorder ?? DeviceVoiceRecorderController(),
        player = player ?? DeviceVoicePlayerController();

  final ProfilePromptsApi profilePromptsApi;
  final String otherUserId;
  final VoiceRecorderController recorder;
  final VoicePlayerController player;

  @override
  State<VoicePromptReactionScreen> createState() => _VoicePromptReactionScreenState();
}

class _VoicePromptReactionScreenState extends State<VoicePromptReactionScreen> {
  List<VoicePromptAnswer> _answers = [];
  bool _isLoading = true;
  String? _errorText;
  String? _statusText;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _isLoading = true;
      _errorText = null;
    });
    try {
      final answers = await widget.profilePromptsApi.fetchAnswersForUser(widget.otherUserId);
      setState(() => _answers = answers);
    } on ProfilePromptsApiException catch (e) {
      setState(() => _errorText = e.message);
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  Future<void> _play(VoicePromptAnswer answer) async {
    await widget.player.play(answer.audioUrl);
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
                if (_statusText != null) ...[
                  Text(_statusText!, style: const TextStyle(color: Colors.green)),
                  const SizedBox(height: 12),
                ],
                if (_answers.isEmpty) const Text('No voice prompt answers yet.'),
                for (final answer in _answers) _buildAnswerTile(answer),
              ],
            ),
    );
  }

  Widget _buildAnswerTile(VoicePromptAnswer answer) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(answer.question, style: const TextStyle(fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            Row(
              children: [
                Text('${answer.durationSeconds}s answer'),
                const Spacer(),
                IconButton(
                  icon: const Icon(Icons.play_arrow),
                  onPressed: () => _play(answer),
                ),
                TextButton.icon(
                  icon: const Icon(Icons.reply),
                  label: const Text('React'),
                  onPressed: () => _react(answer),
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
        ),
      ),
    );
  }

  Future<void> _react(VoicePromptAnswer answer) async {
    setState(() {
      _errorText = null;
      _statusText = null;
    });

    final result = await showDialog<_ReactionInput>(
      context: context,
      builder: (context) => _ReactDialog(recorder: widget.recorder),
    );
    if (result == null || (result.comment == null && result.audioReplyPath == null)) {
      return;
    }

    try {
      await widget.profilePromptsApi.reactToVoicePrompt(
        promptId: answer.promptId,
        targetUserId: widget.otherUserId,
        comment: result.comment,
        audioReplyUrl: result.audioReplyPath,
        durationSeconds: result.audioReplyDurationSeconds,
      );
      setState(() => _statusText = 'Reaction sent!');
    } on ProfilePromptsApiException catch (e) {
      setState(() => _errorText = e.message);
    }
  }
}

class _ReactionInput {
  _ReactionInput({this.comment, this.audioReplyPath, this.audioReplyDurationSeconds});

  final String? comment;
  final String? audioReplyPath;
  final int? audioReplyDurationSeconds;
}

class _ReactDialog extends StatefulWidget {
  const _ReactDialog({required this.recorder});

  final VoiceRecorderController recorder;

  @override
  State<_ReactDialog> createState() => _ReactDialogState();
}

class _ReactDialogState extends State<_ReactDialog> {
  final _commentController = TextEditingController();
  bool _isRecording = false;
  String? _recordedPath;
  int _elapsedSeconds = 0;
  Timer? _timer;
  String? _errorText;

  @override
  void dispose() {
    _commentController.dispose();
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _startRecording() async {
    setState(() => _errorText = null);
    final hasPermission = await widget.recorder.hasPermission();
    if (!hasPermission) {
      setState(() => _errorText = 'Microphone permission is required to record a reply.');
      return;
    }

    await widget.recorder.start();
    setState(() {
      _isRecording = true;
      _elapsedSeconds = 0;
    });

    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      setState(() => _elapsedSeconds += 1);
      if (_elapsedSeconds >= _maxReplySeconds) {
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
    });
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('React to this answer'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          TextField(
            controller: _commentController,
            maxLines: 3,
            decoration: const InputDecoration(hintText: 'Leave a comment (optional)…'),
          ),
          const SizedBox(height: 12),
          if (_isRecording)
            Row(
              children: [
                Text('Recording... $_elapsedSeconds/$_maxReplySeconds s'),
                const Spacer(),
                TextButton(onPressed: _stopRecording, child: const Text('Stop')),
              ],
            )
          else if (_recordedPath != null)
            Row(
              children: [
                const Text('Audio reply recorded'),
                const Spacer(),
                IconButton(
                  icon: const Icon(Icons.delete_outline),
                  onPressed: () => setState(() => _recordedPath = null),
                ),
              ],
            )
          else
            OutlinedButton.icon(
              icon: const Icon(Icons.mic),
              label: const Text('Record an audio reply (optional)'),
              onPressed: _startRecording,
            ),
          if (_errorText != null)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(_errorText!, style: const TextStyle(color: Colors.red)),
            ),
        ],
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Cancel')),
        TextButton(
          onPressed: () {
            final comment = _commentController.text.trim();
            Navigator.of(context).pop(
              _ReactionInput(
                comment: comment.isEmpty ? null : comment,
                audioReplyPath: _recordedPath,
                audioReplyDurationSeconds: _recordedPath == null ? null : _elapsedSeconds,
              ),
            );
          },
          child: const Text('Send'),
        ),
      ],
    );
  }
}
