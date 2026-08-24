import 'package:flutter/material.dart';

import 'profile_completion_api.dart';

/// Shows a gamified progress bar toward a fully-filled-out profile, with a
/// checklist of what's still missing. Reaching 100% grants a one-time
/// visibility boost server-side; [_rewardMessage] surfaces that the first
/// time it happens.
class ProfileCompletionScreen extends StatefulWidget {
  const ProfileCompletionScreen({super.key, required this.profileCompletionApi});

  final ProfileCompletionApi profileCompletionApi;

  @override
  State<ProfileCompletionScreen> createState() => _ProfileCompletionScreenState();
}

class _ProfileCompletionScreenState extends State<ProfileCompletionScreen> {
  ProfileCompletion? _completion;
  bool _isLoading = true;
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
      final completion = await widget.profileCompletionApi.fetchCompletion();
      setState(() => _completion = completion);
    } on ProfileCompletionApiException catch (e) {
      setState(() => _errorText = e.message);
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final completion = _completion;
    return Scaffold(
      appBar: AppBar(title: const Text('Profile Strength')),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : completion == null
              ? Center(child: Text(_errorText ?? 'Unable to load profile completion.'))
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView(
                    padding: const EdgeInsets.all(16),
                    children: [
                      if (_errorText != null)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 16),
                          child: Text(_errorText!, style: const TextStyle(color: Colors.red)),
                        ),
                      if (completion.rewardGranted)
                        const Padding(
                          padding: EdgeInsets.only(bottom: 16),
                          child: Text(
                            'Profile complete! You just earned a free visibility boost.',
                            style: TextStyle(color: Colors.green, fontWeight: FontWeight.bold),
                          ),
                        ),
                      Text('${completion.percentage}% complete', style: Theme.of(context).textTheme.titleLarge),
                      const SizedBox(height: 8),
                      ClipRRect(
                        borderRadius: BorderRadius.circular(8),
                        child: LinearProgressIndicator(
                          value: completion.percentage / 100,
                          minHeight: 12,
                        ),
                      ),
                      const SizedBox(height: 24),
                      ...completion.checklist.map((item) {
                        return ListTile(
                          leading: Icon(
                            item.completed ? Icons.check_circle : Icons.radio_button_unchecked,
                            color: item.completed ? Colors.green : Colors.grey,
                          ),
                          title: Text(item.label),
                          trailing: Text('+${item.weight}%'),
                        );
                      }),
                    ],
                  ),
                ),
    );
  }
}
