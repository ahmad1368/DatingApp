import 'package:flutter/material.dart';

import 'vetting_api.dart';

/// Committee-only review queue: pending applications ranked by peer
/// referral count, each approvable or rejectable with an optional reason -
/// see VettingService.listQueue/decide on the backend. A non-committee
/// member gets a 403 from the backend, surfaced here as an error message.
class CommitteeReviewScreen extends StatefulWidget {
  const CommitteeReviewScreen({super.key, required this.vettingApi});

  final VettingApi vettingApi;

  @override
  State<CommitteeReviewScreen> createState() => _CommitteeReviewScreenState();
}

class _CommitteeReviewScreenState extends State<CommitteeReviewScreen> {
  List<QueuedApplication> _queue = [];
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
      final queue = await widget.vettingApi.fetchQueue();
      setState(() => _queue = queue);
    } on VettingApiException catch (e) {
      setState(() => _errorText = e.message);
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  Future<void> _decide(QueuedApplication application, String decision, String? reason) async {
    setState(() => _errorText = null);
    try {
      await widget.vettingApi.decide(applicationId: application.id, decision: decision, reason: reason);
      setState(() => _queue = _queue.where((a) => a.id != application.id).toList());
    } on VettingApiException catch (e) {
      setState(() => _errorText = e.message);
    }
  }

  Future<void> _rejectWithReason(QueuedApplication application) async {
    final controller = TextEditingController();
    final reason = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Reject application'),
        content: TextField(
          controller: controller,
          decoration: const InputDecoration(hintText: 'Reason (optional)'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Cancel')),
          TextButton(
            onPressed: () => Navigator.of(context).pop(controller.text.trim()),
            child: const Text('Reject'),
          ),
        ],
      ),
    );
    if (reason == null) {
      return;
    }
    await _decide(application, 'REJECTED', reason.isEmpty ? null : reason);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Committee Review Queue')),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : Column(
              children: [
                if (_errorText != null)
                  Padding(
                    padding: const EdgeInsets.all(16),
                    child: Text(_errorText!, style: const TextStyle(color: Colors.red)),
                  ),
                Expanded(
                  child: _queue.isEmpty
                      ? const Center(child: Text('No pending applications.'))
                      : ListView.builder(
                          itemCount: _queue.length,
                          itemBuilder: (context, index) {
                            final application = _queue[index];
                            return ListTile(
                              title: Text('${application.referralCount} peer referral(s)'),
                              subtitle: Text(
                                application.socialLinks.isEmpty
                                    ? 'No social links provided'
                                    : application.socialLinks.join(', '),
                              ),
                              trailing: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  IconButton(
                                    icon: const Icon(Icons.check, color: Colors.green),
                                    tooltip: 'Approve',
                                    onPressed: () => _decide(application, 'APPROVED', null),
                                  ),
                                  IconButton(
                                    icon: const Icon(Icons.close, color: Colors.red),
                                    tooltip: 'Reject',
                                    onPressed: () => _rejectWithReason(application),
                                  ),
                                ],
                              ),
                            );
                          },
                        ),
                ),
              ],
            ),
    );
  }
}
