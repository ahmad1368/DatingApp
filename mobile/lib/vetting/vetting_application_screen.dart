import 'package:flutter/material.dart';

import 'vetting_api.dart';

/// The applicant-facing side of member vetting: submit an application with
/// optional social links, track its status, redeem a referral code from an
/// existing member, and - once approved - fetch a shareable referral code
/// or refer a new applicant directly. See VettingService on the backend.
class VettingApplicationScreen extends StatefulWidget {
  const VettingApplicationScreen({super.key, required this.vettingApi});

  final VettingApi vettingApi;

  @override
  State<VettingApplicationScreen> createState() => _VettingApplicationScreenState();
}

class _VettingApplicationScreenState extends State<VettingApplicationScreen> {
  final _socialLinksController = TextEditingController();
  final _referralCodeController = TextEditingController();
  final _referApplicantController = TextEditingController();

  VettingApplication? _application;
  String? _myReferralCode;
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
    _socialLinksController.dispose();
    _referralCodeController.dispose();
    _referApplicantController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _isLoading = true;
      _errorText = null;
    });
    try {
      final application = await widget.vettingApi.fetchMyApplication();
      setState(() => _application = application);
    } on VettingApiException catch (e) {
      setState(() => _errorText = e.message);
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  List<String> _parseSocialLinks() {
    return _socialLinksController.text
        .split('\n')
        .map((link) => link.trim())
        .where((link) => link.isNotEmpty)
        .toList();
  }

  Future<void> _apply() async {
    setState(() {
      _isSubmitting = true;
      _errorText = null;
      _statusText = null;
    });
    try {
      final application = await widget.vettingApi.apply(_parseSocialLinks());
      setState(() => _application = application);
    } on VettingApiException catch (e) {
      setState(() => _errorText = e.message);
    } finally {
      if (mounted) {
        setState(() => _isSubmitting = false);
      }
    }
  }

  Future<void> _redeemReferralCode() async {
    final code = _referralCodeController.text.trim();
    if (code.isEmpty) {
      return;
    }
    setState(() {
      _isSubmitting = true;
      _errorText = null;
      _statusText = null;
    });
    try {
      final application = await widget.vettingApi.redeemReferralCode(code);
      setState(() {
        _application = application;
        _referralCodeController.clear();
        _statusText = 'Referral added.';
      });
    } on VettingApiException catch (e) {
      setState(() => _errorText = e.message);
    } finally {
      if (mounted) {
        setState(() => _isSubmitting = false);
      }
    }
  }

  Future<void> _fetchMyReferralCode() async {
    setState(() => _errorText = null);
    try {
      final code = await widget.vettingApi.fetchMyReferralCode();
      setState(() => _myReferralCode = code);
    } on VettingApiException catch (e) {
      setState(() => _errorText = e.message);
    }
  }

  Future<void> _referApplicant() async {
    final applicantUserId = _referApplicantController.text.trim();
    if (applicantUserId.isEmpty) {
      return;
    }
    setState(() {
      _isSubmitting = true;
      _errorText = null;
      _statusText = null;
    });
    try {
      await widget.vettingApi.refer(applicantUserId);
      setState(() {
        _referApplicantController.clear();
        _statusText = 'Referral sent.';
      });
    } on VettingApiException catch (e) {
      setState(() => _errorText = e.message);
    } finally {
      if (mounted) {
        setState(() => _isSubmitting = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Membership Application')),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                if (_errorText != null) ...[
                  Text(_errorText!, style: const TextStyle(color: Colors.red)),
                  const SizedBox(height: 8),
                ],
                if (_statusText != null) ...[
                  Text(_statusText!, style: const TextStyle(color: Colors.green)),
                  const SizedBox(height: 8),
                ],
                if (_application == null) ..._buildApplyForm() else ..._buildApplicationStatus(_application!),
              ],
            ),
    );
  }

  List<Widget> _buildApplyForm() {
    return [
      const Text(
        'Membership is by invitation: apply below, then ask an existing member '
        'to refer you or share their referral code with you.',
      ),
      const SizedBox(height: 16),
      TextField(
        controller: _socialLinksController,
        maxLines: 3,
        decoration: const InputDecoration(
          labelText: 'Social profile links (one per line, optional)',
        ),
      ),
      const SizedBox(height: 16),
      ElevatedButton(
        onPressed: _isSubmitting ? null : _apply,
        child: const Text('Submit application'),
      ),
    ];
  }

  List<Widget> _buildApplicationStatus(VettingApplication application) {
    return [
      Text('Status: ${application.status}', style: const TextStyle(fontWeight: FontWeight.bold)),
      const SizedBox(height: 8),
      Text('Peer referrals: ${application.referralCount}'),
      if (application.decisionReason != null) ...[
        const SizedBox(height: 8),
        Text('Reason: ${application.decisionReason}'),
      ],
      if (application.isPending) ...[
        const Divider(height: 32),
        const Text('Have a referral code from a member?'),
        const SizedBox(height: 8),
        TextField(
          controller: _referralCodeController,
          decoration: const InputDecoration(labelText: 'Referral code'),
        ),
        const SizedBox(height: 8),
        ElevatedButton(
          onPressed: _isSubmitting ? null : _redeemReferralCode,
          child: const Text('Redeem code'),
        ),
      ],
      if (application.isApproved) ...[
        const Divider(height: 32),
        const Text("You're a member!", style: TextStyle(fontWeight: FontWeight.bold)),
        const SizedBox(height: 16),
        if (_myReferralCode != null)
          Text('Your referral code: $_myReferralCode', style: const TextStyle(fontSize: 18))
        else
          OutlinedButton(
            onPressed: _fetchMyReferralCode,
            child: const Text('Get my referral code'),
          ),
        const Divider(height: 32),
        const Text('Refer a new applicant'),
        const SizedBox(height: 8),
        TextField(
          controller: _referApplicantController,
          decoration: const InputDecoration(labelText: "Applicant's user id"),
        ),
        const SizedBox(height: 8),
        ElevatedButton(
          onPressed: _isSubmitting ? null : _referApplicant,
          child: const Text('Refer'),
        ),
      ],
    ];
  }
}
