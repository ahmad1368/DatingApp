import 'package:flutter/material.dart';

import 'profile_prompts_api.dart';
import 'video_answer_player_controller.dart';
import 'video_recorder_controller.dart';

/// Lets a user record a short video answer to one of a fixed set of profile
/// prompts, giving potential matches an authentic preview of their body
/// language and voice - and embeds playback of the recorded clip right on
/// the same card once it's saved.
class VideoPromptsScreen extends StatefulWidget {
  VideoPromptsScreen({
    super.key,
    required this.profilePromptsApi,
    VideoRecorderController? recorder,
    VideoAnswerPlayerController? player,
  })  : recorder = recorder ?? DeviceVideoRecorderController(),
        player = player ?? DeviceVideoAnswerPlayerController();

  final ProfilePromptsApi profilePromptsApi;
  final VideoRecorderController recorder;
  final VideoAnswerPlayerController player;

  @override
  State<VideoPromptsScreen> createState() => _VideoPromptsScreenState();
}

class _VideoPromptsScreenState extends State<VideoPromptsScreen> {
  List<ProfilePrompt> _prompts = [];
  Map<String, VideoPromptAnswer> _answersByPromptId = {};
  bool _isLoading = true;
  bool _isBusy = false;
  String? _errorText;

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
      final results = await Future.wait([
        widget.profilePromptsApi.fetchPrompts(),
        widget.profilePromptsApi.fetchMyVideoAnswers(),
      ]);
      setState(() {
        _prompts = results[0] as List<ProfilePrompt>;
        _answersByPromptId = {
          for (final answer in results[1] as List<VideoPromptAnswer>) answer.promptId: answer,
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

  Future<void> _record(String promptId) async {
    setState(() => _errorText = null);

    final recorded = await widget.recorder.record();
    if (recorded == null) {
      return;
    }

    setState(() => _isBusy = true);
    try {
      final answer = await widget.profilePromptsApi.recordVideoAnswer(
        promptId: promptId,
        videoUrl: recorded.path,
        durationSeconds: recorded.durationSeconds,
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

  Future<void> _play(VideoPromptAnswer answer) async {
    await widget.player.play(answer.videoUrl);
  }

  Future<void> _delete(String promptId) async {
    setState(() => _errorText = null);
    try {
      await widget.profilePromptsApi.deleteVideoAnswer(promptId);
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
      appBar: AppBar(title: const Text('Video Prompts')),
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

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(prompt.question, style: const TextStyle(fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            if (answer != null)
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Text('${answer.durationSeconds}s video'),
                      const Spacer(),
                      IconButton(
                        icon: const Icon(Icons.play_arrow),
                        onPressed: _isBusy ? null : () => _play(answer),
                      ),
                      IconButton(
                        icon: const Icon(Icons.videocam),
                        tooltip: 'Re-record',
                        onPressed: _isBusy ? null : () => _record(prompt.id),
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
                onPressed: _isBusy ? null : () => _record(prompt.id),
                child: const Text('Record video answer'),
              ),
          ],
        ),
      ),
    );
  }
}
