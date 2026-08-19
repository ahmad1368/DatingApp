import 'package:flutter/material.dart';

import 'voice_player_controller.dart';

/// A compact play/stop control for a saved voice intro, meant to be
/// embedded wherever a profile card is rendered.
class VoiceIntroPlayer extends StatefulWidget {
  VoiceIntroPlayer({
    super.key,
    required this.url,
    this.durationSeconds,
    VoicePlayerController? player,
  }) : player = player ?? DeviceVoicePlayerController();

  final String url;
  final int? durationSeconds;
  final VoicePlayerController player;

  @override
  State<VoiceIntroPlayer> createState() => _VoiceIntroPlayerState();
}

class _VoiceIntroPlayerState extends State<VoiceIntroPlayer> {
  bool _isPlaying = false;

  Future<void> _toggle() async {
    if (_isPlaying) {
      await widget.player.stop();
    } else {
      await widget.player.play(widget.url);
    }
    setState(() => _isPlaying = !_isPlaying);
  }

  @override
  Widget build(BuildContext context) {
    final duration = widget.durationSeconds;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        IconButton(
          icon: Icon(_isPlaying ? Icons.stop_circle : Icons.play_circle),
          onPressed: _toggle,
        ),
        Text(duration == null ? 'Voice intro' : 'Voice intro · $duration s'),
      ],
    );
  }
}
