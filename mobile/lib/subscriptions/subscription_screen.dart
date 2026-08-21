import 'package:flutter/material.dart';

import 'subscriptions_api.dart';

/// Lets a user browse the subscription tier catalog, see their current
/// status, and subscribe to or cancel a paid tier.
class SubscriptionScreen extends StatefulWidget {
  const SubscriptionScreen({super.key, required this.subscriptionsApi});

  final SubscriptionsApi subscriptionsApi;

  @override
  State<SubscriptionScreen> createState() => _SubscriptionScreenState();
}

class _SubscriptionScreenState extends State<SubscriptionScreen> {
  List<SubscriptionPlan> _catalog = [];
  SubscriptionStatus? _status;
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
      final results = await Future.wait([
        widget.subscriptionsApi.fetchCatalog(),
        widget.subscriptionsApi.fetchStatus(),
      ]);
      setState(() {
        _catalog = results[0] as List<SubscriptionPlan>;
        _status = results[1] as SubscriptionStatus;
      });
    } on SubscriptionsApiException catch (e) {
      setState(() => _errorText = e.message);
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  Future<void> _subscribe(SubscriptionPlan plan) async {
    setState(() => _errorText = null);
    try {
      final status = await widget.subscriptionsApi.subscribe(plan.tier);
      setState(() => _status = status);
    } on SubscriptionsApiException catch (e) {
      setState(() => _errorText = e.message);
    }
  }

  Future<void> _cancel() async {
    setState(() => _errorText = null);
    try {
      final status = await widget.subscriptionsApi.cancel();
      setState(() => _status = status);
    } on SubscriptionsApiException catch (e) {
      setState(() => _errorText = e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final status = _status;
    return Scaffold(
      appBar: AppBar(title: const Text('Subscription')),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                if (status != null)
                  Text(
                    status.isActive ? 'Current plan: ${status.tier}' : 'Current plan: Free',
                    style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                  ),
                if (status?.isActive ?? false) ...[
                  const SizedBox(height: 8),
                  OutlinedButton(onPressed: _cancel, child: const Text('Cancel subscription')),
                ],
                if (_errorText != null) ...[
                  const SizedBox(height: 8),
                  Text(_errorText!, style: const TextStyle(color: Colors.red)),
                ],
                const SizedBox(height: 24),
                for (final plan in _catalog)
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            '${plan.label} - \$${plan.priceUsdPerMonth.toStringAsFixed(2)}/mo',
                            style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                          ),
                          const SizedBox(height: 8),
                          for (final feature in plan.features) Text('• $feature'),
                          if (plan.tier != 'FREE') ...[
                            const SizedBox(height: 12),
                            ElevatedButton(
                              onPressed: status?.tier == plan.tier ? null : () => _subscribe(plan),
                              child: Text(status?.tier == plan.tier ? 'Current plan' : 'Subscribe'),
                            ),
                          ],
                        ],
                      ),
                    ),
                  ),
              ],
            ),
    );
  }
}
