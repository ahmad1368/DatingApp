import 'package:flutter/material.dart';

import 'profile_poll_api.dart';

const _minOptions = 2;
const _maxOptions = 6;

/// Lets the current user set, edit, or clear the poll embedded on their own
/// profile card, and see who has voted on it - see ProfilePollApi.
class ProfilePollScreen extends StatefulWidget {
  const ProfilePollScreen({super.key, required this.profilePollApi, required this.currentUserId});

  final ProfilePollApi profilePollApi;
  final String currentUserId;

  @override
  State<ProfilePollScreen> createState() => _ProfilePollScreenState();
}

class _ProfilePollScreenState extends State<ProfilePollScreen> {
  final _questionController = TextEditingController();
  final _optionControllers = <TextEditingController>[
    TextEditingController(),
    TextEditingController(),
  ];
  List<ProfilePollVoter> _voters = [];
  bool _isLoading = true;
  bool _isSaving = false;
  String? _errorText;
  String? _statusText;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _questionController.dispose();
    for (final controller in _optionControllers) {
      controller.dispose();
    }
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _isLoading = true;
      _errorText = null;
    });
    try {
      final results = await Future.wait([
        widget.profilePollApi.fetchPoll(widget.currentUserId),
        widget.profilePollApi.fetchVoters(),
      ]);
      final poll = results[0] as ProfilePoll;
      setState(() {
        _voters = results[1] as List<ProfilePollVoter>;
        if (poll.hasPoll) {
          _questionController.text = poll.question!;
          _optionControllers
            ..clear()
            ..addAll(poll.options.map((option) => TextEditingController(text: option)));
        }
      });
    } on ProfilePollApiException catch (e) {
      setState(() => _errorText = e.message);
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  void _addOption() {
    if (_optionControllers.length >= _maxOptions) {
      return;
    }
    setState(() => _optionControllers.add(TextEditingController()));
  }

  void _removeOption(int index) {
    if (_optionControllers.length <= _minOptions) {
      return;
    }
    setState(() => _optionControllers.removeAt(index).dispose());
  }

  Future<void> _savePoll() async {
    final question = _questionController.text.trim();
    final options = _optionControllers.map((c) => c.text.trim()).toList();
    if (question.isEmpty || options.any((option) => option.isEmpty)) {
      setState(() => _errorText = 'Fill in the question and every option.');
      return;
    }

    setState(() {
      _isSaving = true;
      _errorText = null;
      _statusText = null;
    });
    try {
      await widget.profilePollApi.setPoll(question: question, options: options);
      setState(() => _statusText = 'Poll saved to your profile.');
    } on ProfilePollApiException catch (e) {
      setState(() => _errorText = e.message);
    } finally {
      if (mounted) {
        setState(() => _isSaving = false);
      }
    }
  }

  Future<void> _clearPoll() async {
    setState(() {
      _errorText = null;
      _statusText = null;
    });
    try {
      await widget.profilePollApi.clearPoll();
      setState(() {
        _questionController.clear();
        _optionControllers
          ..clear()
          ..addAll([TextEditingController(), TextEditingController()]);
        _statusText = 'Poll removed from your profile.';
      });
    } on ProfilePollApiException catch (e) {
      setState(() => _errorText = e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Profile Poll')),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                if (_errorText != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: Text(_errorText!, style: const TextStyle(color: Colors.red)),
                  ),
                if (_statusText != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: Text(_statusText!, style: const TextStyle(fontWeight: FontWeight.bold)),
                  ),
                const Text(
                  'Add a quick poll to your profile card so prospective matches can '
                  'respond with a single tap.',
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: _questionController,
                  maxLength: 200,
                  decoration: const InputDecoration(labelText: 'Question'),
                ),
                for (var i = 0; i < _optionControllers.length; i++)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Row(
                      children: [
                        Expanded(
                          child: TextField(
                            controller: _optionControllers[i],
                            decoration: InputDecoration(labelText: 'Option ${i + 1}'),
                          ),
                        ),
                        if (_optionControllers.length > _minOptions)
                          IconButton(
                            icon: const Icon(Icons.remove_circle_outline),
                            onPressed: () => _removeOption(i),
                          ),
                      ],
                    ),
                  ),
                if (_optionControllers.length < _maxOptions)
                  TextButton.icon(
                    onPressed: _addOption,
                    icon: const Icon(Icons.add),
                    label: const Text('Add option'),
                  ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    ElevatedButton(
                      onPressed: _isSaving ? null : _savePoll,
                      child: const Text('Save poll'),
                    ),
                    const SizedBox(width: 12),
                    TextButton(
                      onPressed: _isSaving ? null : _clearPoll,
                      child: const Text('Remove poll'),
                    ),
                  ],
                ),
                const SizedBox(height: 24),
                const Text('Who Voted', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                if (_voters.isEmpty) const Text('No votes yet.'),
                for (final voter in _voters)
                  ListTile(
                    title: Text(voter.voterName ?? 'Someone new'),
                    subtitle: Text('Picked option ${voter.optionIndex + 1}'),
                  ),
              ],
            ),
    );
  }
}
