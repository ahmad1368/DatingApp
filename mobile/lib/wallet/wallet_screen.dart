import 'package:flutter/material.dart';

import 'wallet_api.dart';

/// Lets a user browse coin packages, buy more coins, and see their coin
/// balance and purchase history. The same coin balance is spent elsewhere
/// in the app on virtual gifts, boosts, and other a la carte unlocks.
class WalletScreen extends StatefulWidget {
  const WalletScreen({super.key, required this.walletApi});

  final WalletApi walletApi;

  @override
  State<WalletScreen> createState() => _WalletScreenState();
}

class _WalletScreenState extends State<WalletScreen> {
  List<CoinPackage> _catalog = [];
  List<CoinPurchase> _purchases = [];
  int _coinBalance = 0;
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
        widget.walletApi.fetchCatalog(),
        widget.walletApi.fetchBalance(),
        widget.walletApi.fetchPurchases(),
      ]);
      setState(() {
        _catalog = results[0] as List<CoinPackage>;
        _coinBalance = results[1] as int;
        _purchases = results[2] as List<CoinPurchase>;
      });
    } on WalletApiException catch (e) {
      setState(() => _errorText = e.message);
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  Future<void> _purchase(CoinPackage coinPackage) async {
    setState(() {
      _errorText = null;
      _statusText = null;
    });
    try {
      final newBalance = await widget.walletApi.purchaseCoins(coinPackage.id);
      setState(() {
        _coinBalance = newBalance;
        _statusText = 'Purchased ${coinPackage.label}!';
      });
      final purchases = await widget.walletApi.fetchPurchases();
      setState(() => _purchases = purchases);
    } on WalletApiException catch (e) {
      setState(() => _errorText = e.message);
    }
  }

  String _priceLabel(int priceUsdCents) => '\$${(priceUsdCents / 100).toStringAsFixed(2)}';

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Wallet')),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Text(
                  'Coin balance: $_coinBalance',
                  style: const TextStyle(fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 12),
                for (final coinPackage in _catalog)
                  Card(
                    child: ListTile(
                      title: Text(coinPackage.label),
                      subtitle: Text(_priceLabel(coinPackage.priceUsdCents)),
                      trailing: ElevatedButton(
                        onPressed: () => _purchase(coinPackage),
                        child: const Text('Buy'),
                      ),
                    ),
                  ),
                if (_errorText != null) ...[
                  const SizedBox(height: 8),
                  Text(_errorText!, style: const TextStyle(color: Colors.red)),
                ],
                if (_statusText != null) ...[
                  const SizedBox(height: 8),
                  Text(_statusText!),
                ],
                const SizedBox(height: 24),
                const Text('Purchase history', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                if (_purchases.isEmpty) const Text('No purchases yet.'),
                for (final purchase in _purchases)
                  ListTile(
                    title: Text(purchase.coinPackage.label),
                    subtitle: Text(_priceLabel(purchase.coinPackage.priceUsdCents)),
                  ),
              ],
            ),
    );
  }
}
