import 'package:flutter/material.dart';

import 'work_verification_api.dart';

/// Lets the user claim a job title/company or a school, then verify it by
/// confirming a one-time code sent to that credential's email - toggled via
/// the WORK/EDUCATION chips, sharing the same request/confirm flow.
class WorkVerificationScreen extends StatefulWidget {
  const WorkVerificationScreen({super.key, required this.workVerificationApi});

  final WorkVerificationApi workVerificationApi;

  @override
  State<WorkVerificationScreen> createState() => _WorkVerificationScreenState();
}

class _WorkVerificationScreenState extends State<WorkVerificationScreen> {
  final _jobTitleController = TextEditingController();
  final _companyController = TextEditingController();
  final _schoolController = TextEditingController();
  final _emailController = TextEditingController();
  final _codeController = TextEditingController();

  String _type = 'WORK';
  CredentialStatus? _status;
  bool _codeSent = false;
  bool _isLoading = true;
  bool _isSubmitting = false;
  String? _errorText;
  String? _statusText;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _jobTitleController.dispose();
    _companyController.dispose();
    _schoolController.dispose();
    _emailController.dispose();
    _codeController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _isLoading = true;
      _errorText = null;
    });
    try {
      final status = await widget.workVerificationApi.fetchStatus();
      setState(() {
        _status = status;
        _jobTitleController.text = status.jobTitle ?? '';
        _companyController.text = status.company ?? '';
        _schoolController.text = status.school ?? '';
      });
    } on WorkVerificationApiException catch (e) {
      setState(() => _errorText = e.message);
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  Future<void> _requestVerification() async {
    setState(() {
      _isSubmitting = true;
      _errorText = null;
      _statusText = null;
    });
    try {
      await widget.workVerificationApi.requestVerification(
        type: _type,
        email: _emailController.text.trim(),
        jobTitle: _type == 'WORK' ? _jobTitleController.text.trim() : null,
        company: _type == 'WORK' ? _companyController.text.trim() : null,
        school: _type == 'EDUCATION' ? _schoolController.text.trim() : null,
      );
      setState(() {
        _codeSent = true;
        _statusText = 'Check your email for a verification code.';
      });
    } on WorkVerificationApiException catch (e) {
      setState(() => _errorText = e.message);
    } finally {
      if (mounted) {
        setState(() => _isSubmitting = false);
      }
    }
  }

  Future<void> _confirmVerification() async {
    setState(() {
      _isSubmitting = true;
      _errorText = null;
      _statusText = null;
    });
    try {
      final status = await widget.workVerificationApi.confirmVerification(
        _codeController.text.trim(),
      );
      setState(() {
        _status = status;
        _codeSent = false;
        _codeController.clear();
        _statusText = 'Verified!';
      });
    } on WorkVerificationApiException catch (e) {
      setState(() => _errorText = e.message);
    } finally {
      if (mounted) {
        setState(() => _isSubmitting = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final isWork = _type == 'WORK';
    final isVerified = isWork ? (_status?.isWorkVerified ?? false) : (_status?.isEducationVerified ?? false);

    return Scaffold(
      appBar: AppBar(title: const Text('Work & Education Verification')),
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
                    child: Text(_statusText!),
                  ),
                Row(
                  children: [
                    ChoiceChip(
                      label: const Text('Work'),
                      selected: isWork,
                      onSelected: (_) => setState(() => _type = 'WORK'),
                    ),
                    const SizedBox(width: 8),
                    ChoiceChip(
                      label: const Text('Education'),
                      selected: !isWork,
                      onSelected: (_) => setState(() => _type = 'EDUCATION'),
                    ),
                    const SizedBox(width: 8),
                    if (isVerified) const Icon(Icons.verified, color: Colors.blue),
                  ],
                ),
                const SizedBox(height: 16),
                if (isWork) ...[
                  TextField(
                    controller: _jobTitleController,
                    decoration: const InputDecoration(labelText: 'Job title'),
                  ),
                  const SizedBox(height: 8),
                  TextField(
                    controller: _companyController,
                    decoration: const InputDecoration(labelText: 'Company'),
                  ),
                ] else
                  TextField(
                    controller: _schoolController,
                    decoration: const InputDecoration(labelText: 'School'),
                  ),
                const SizedBox(height: 8),
                TextField(
                  controller: _emailController,
                  keyboardType: TextInputType.emailAddress,
                  decoration: InputDecoration(
                    labelText: isWork ? 'Work email' : 'School email',
                  ),
                ),
                const SizedBox(height: 16),
                ElevatedButton(
                  onPressed: _isSubmitting ? null : _requestVerification,
                  child: const Text('Send verification code'),
                ),
                if (_codeSent) ...[
                  const SizedBox(height: 16),
                  TextField(
                    controller: _codeController,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(labelText: 'Verification code'),
                  ),
                  const SizedBox(height: 8),
                  ElevatedButton(
                    onPressed: _isSubmitting ? null : _confirmVerification,
                    child: const Text('Confirm'),
                  ),
                ],
              ],
            ),
    );
  }
}
