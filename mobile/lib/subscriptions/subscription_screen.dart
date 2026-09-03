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

const _tierRank = {'FREE': 0, 'PLUS': 1, 'GOLD': 2, 'PLATINUM': 3};

class _SubscriptionScreenState extends State<SubscriptionScreen> {
  List<SubscriptionPlan> _catalog = [];
  SubscriptionStatus? _status;
  List<SubscriptionGift> _receivedGifts = [];
  List<SubscriptionVoucher> _myVouchers = [];
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
      final results = await Future.wait([
        widget.subscriptionsApi.fetchCatalog(),
        widget.subscriptionsApi.fetchStatus(),
        widget.subscriptionsApi.fetchReceivedGifts(),
        widget.subscriptionsApi.fetchMyVouchers(),
      ]);
      setState(() {
        _catalog = results[0] as List<SubscriptionPlan>;
        _status = results[1] as SubscriptionStatus;
        _receivedGifts = results[2] as List<SubscriptionGift>;
        _myVouchers = results[3] as List<SubscriptionVoucher>;
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

  /// Whether subscribing to [plan] would be a mid-cycle upgrade from the
  /// current active paid tier - the backend carries the unused time on the
  /// current tier forward as bonus time on the new one for this case (see
  /// SubscriptionsService.subscribe/computeSubscribeExpiresAt).
  bool _isUpgrade(SubscriptionPlan plan) {
    final status = _status;
    if (status == null || !status.isActive) {
      return false;
    }
    return (_tierRank[plan.tier] ?? 0) > (_tierRank[status.tier] ?? 0);
  }

  Future<void> _giftPlan(SubscriptionPlan plan) async {
    final controller = TextEditingController();
    final recipientId = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Gift ${plan.label}'),
        content: TextField(
          controller: controller,
          decoration: const InputDecoration(labelText: "Recipient's user ID"),
          autofocus: true,
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(controller.text.trim()),
            child: const Text('Send gift'),
          ),
        ],
      ),
    );
    if (recipientId == null || recipientId.isEmpty) {
      return;
    }

    setState(() => _errorText = null);
    try {
      await widget.subscriptionsApi.giftSubscription(
        recipientId: recipientId,
        tier: plan.tier,
      );
      await _load();
    } on SubscriptionsApiException catch (e) {
      setState(() => _errorText = e.message);
    }
  }

  Future<void> _buyVoucher(SubscriptionPlan plan) async {
    setState(() {
      _errorText = null;
      _statusText = null;
    });
    try {
      final voucher = await widget.subscriptionsApi.purchaseVoucher(plan.tier);
      setState(() => _myVouchers = [voucher, ..._myVouchers]);
      if (!mounted) return;
      await showDialog<void>(
        context: context,
        builder: (context) => AlertDialog(
          title: Text('${plan.label} voucher'),
          content: SelectableText(voucher.code),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Close'),
            ),
          ],
        ),
      );
    } on SubscriptionsApiException catch (e) {
      setState(() => _errorText = e.message);
    }
  }

  Future<void> _redeemVoucher() async {
    final controller = TextEditingController();
    final code = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Redeem a voucher'),
        content: TextField(
          controller: controller,
          decoration: const InputDecoration(labelText: 'Voucher code'),
          autofocus: true,
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(controller.text.trim()),
            child: const Text('Redeem'),
          ),
        ],
      ),
    );
    if (code == null || code.isEmpty) {
      return;
    }

    setState(() {
      _errorText = null;
      _statusText = null;
    });
    try {
      final status = await widget.subscriptionsApi.redeemVoucher(code);
      setState(() {
        _status = status;
        _statusText = 'Voucher redeemed!';
      });
    } on SubscriptionsApiException catch (e) {
      setState(() => _errorText = e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final status = _status;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Subscription'),
        actions: [
          TextButton(
            onPressed: _redeemVoucher,
            child: const Text(
              'Redeem code',
              style: TextStyle(color: Colors.white),
            ),
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                if (status != null)
                  Text(
                    status.isActive
                        ? 'Current plan: ${status.tier}'
                        : 'Current plan: Free',
                    style: const TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 16,
                    ),
                  ),
                if (status?.isActive ?? false) ...[
                  const SizedBox(height: 8),
                  OutlinedButton(
                    onPressed: _cancel,
                    child: const Text('Cancel subscription'),
                  ),
                ],
                if (_errorText != null) ...[
                  const SizedBox(height: 8),
                  Text(_errorText!, style: const TextStyle(color: Colors.red)),
                ],
                if (_statusText != null) ...[
                  const SizedBox(height: 8),
                  Text(
                    _statusText!,
                    style: const TextStyle(color: Colors.green),
                  ),
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
                            style: const TextStyle(
                              fontWeight: FontWeight.bold,
                              fontSize: 16,
                            ),
                          ),
                          const SizedBox(height: 8),
                          for (final feature in plan.features)
                            Text('• $feature'),
                          if (plan.tier != 'FREE') ...[
                            const SizedBox(height: 12),
                            Row(
                              children: [
                                ElevatedButton(
                                  onPressed: status?.tier == plan.tier
                                      ? null
                                      : () => _subscribe(plan),
                                  child: Text(
                                    status?.tier == plan.tier
                                        ? 'Current plan'
                                        : _isUpgrade(plan)
                                        ? 'Upgrade'
                                        : 'Subscribe',
                                  ),
                                ),
                                const SizedBox(width: 8),
                                OutlinedButton(
                                  onPressed: () => _giftPlan(plan),
                                  child: const Text('Gift'),
                                ),
                                const SizedBox(width: 8),
                                OutlinedButton(
                                  onPressed: () => _buyVoucher(plan),
                                  child: const Text('Buy voucher'),
                                ),
                              ],
                            ),
                          ],
                        ],
                      ),
                    ),
                  ),
                if (_receivedGifts.isNotEmpty) ...[
                  const SizedBox(height: 24),
                  const Text(
                    'Gifts you\'ve received',
                    style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                  ),
                  for (final gift in _receivedGifts)
                    ListTile(
                      leading: const Icon(Icons.card_giftcard),
                      title: Text(
                        '${gift.tier} from ${gift.otherUserName ?? 'someone'}',
                      ),
                    ),
                ],
                if (_myVouchers.isNotEmpty) ...[
                  const SizedBox(height: 24),
                  const Text(
                    'Your vouchers',
                    style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                  ),
                  for (final voucher in _myVouchers)
                    ListTile(
                      leading: Icon(
                        voucher.isRedeemed
                            ? Icons.check_circle_outline
                            : Icons.confirmation_number,
                      ),
                      title: Text('${voucher.tier} - ${voucher.code}'),
                      subtitle: Text(
                        voucher.isRedeemed ? 'Redeemed' : 'Unredeemed',
                      ),
                    ),
                ],
              ],
            ),
    );
  }
}
