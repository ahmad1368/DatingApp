import 'package:flutter/material.dart';

import 'couples_api.dart';

/// Lets the user switch their discovery deck between solo browsing and
/// joint browsing with one linked partner - only partners who have joint
/// browsing enabled on their link can be selected (see
/// CouplesApi.setActiveBrowsingPartner). Linking/unlinking partners is a
/// separate flow, not covered by this screen.
class CoupleBrowsingScreen extends StatefulWidget {
  const CoupleBrowsingScreen({super.key, required this.couplesApi});

  final CouplesApi couplesApi;

  @override
  State<CoupleBrowsingScreen> createState() => _CoupleBrowsingScreenState();
}

class _CoupleBrowsingScreenState extends State<CoupleBrowsingScreen> {
  List<PartnerLink> _partners = [];
  String? _activePartnerId;
  bool _isLoading = true;
  bool _isSwitching = false;
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
        widget.couplesApi.fetchPartners(),
        widget.couplesApi.fetchActiveBrowsingPartnerId(),
      ]);
      setState(() {
        _partners = results[0] as List<PartnerLink>;
        _activePartnerId = results[1] as String?;
      });
    } on CouplesApiException catch (e) {
      setState(() => _errorText = e.message);
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  Future<void> _switchTo(String? partnerId) async {
    setState(() {
      _isSwitching = true;
      _errorText = null;
    });
    try {
      final updated = await widget.couplesApi.setActiveBrowsingPartner(partnerId);
      setState(() => _activePartnerId = updated);
    } on CouplesApiException catch (e) {
      setState(() => _errorText = e.message);
    } finally {
      if (mounted) {
        setState(() => _isSwitching = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Browsing Mode')),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              children: [
                if (_errorText != null)
                  Padding(
                    padding: const EdgeInsets.all(16),
                    child: Text(_errorText!, style: const TextStyle(color: Colors.red)),
                  ),
                RadioListTile<String?>(
                  title: const Text('Browse Solo'),
                  value: null,
                  groupValue: _activePartnerId,
                  onChanged: _isSwitching ? null : (value) => _switchTo(value),
                ),
                for (final partner in _partners)
                  RadioListTile<String?>(
                    title: Text(partner.partnerName ?? 'Partner'),
                    subtitle: partner.jointBrowsingEnabled
                        ? null
                        : const Text('Enable joint browsing with this partner first'),
                    value: partner.partnerId,
                    groupValue: _activePartnerId,
                    onChanged: (!partner.jointBrowsingEnabled || _isSwitching)
                        ? null
                        : (value) => _switchTo(value),
                  ),
              ],
            ),
    );
  }
}
