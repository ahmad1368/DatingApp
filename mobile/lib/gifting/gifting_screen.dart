import 'package:flutter/material.dart';

import 'gifting_api.dart';

/// Lets a user browse the virtual gift catalog, send a gift directly to
/// another profile (no match required), and see their sent/received
/// history and token balance.
class GiftingScreen extends StatefulWidget {
  const GiftingScreen({super.key, required this.giftingApi});

  final GiftingApi giftingApi;

  @override
  State<GiftingScreen> createState() => _GiftingScreenState();
}

class _GiftingScreenState extends State<GiftingScreen> {
  final _recipientController = TextEditingController();
  List<VirtualGift> _catalog = [];
  List<GiftTransaction> _received = [];
  List<GiftTransaction> _sent = [];
  int _tokenBalance = 0;
  bool _isLoading = true;
  String? _errorText;
  String? _statusText;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _recipientController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _isLoading = true;
      _errorText = null;
    });
    try {
      final results = await Future.wait([
        widget.giftingApi.fetchCatalog(),
        widget.giftingApi.fetchBalance(),
        widget.giftingApi.fetchReceivedGifts(),
        widget.giftingApi.fetchSentGifts(),
      ]);
      setState(() {
        _catalog = results[0] as List<VirtualGift>;
        _tokenBalance = results[1] as int;
        _received = results[2] as List<GiftTransaction>;
        _sent = results[3] as List<GiftTransaction>;
      });
    } on GiftingApiException catch (e) {
      setState(() => _errorText = e.message);
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  Future<void> _sendGift(VirtualGift gift) async {
    final recipientId = _recipientController.text.trim();
    if (recipientId.isEmpty) {
      setState(() => _errorText = 'Enter who you want to send this to first.');
      return;
    }

    setState(() {
      _errorText = null;
      _statusText = null;
    });
    try {
      final newBalance = await widget.giftingApi.sendGift(
        recipientId: recipientId,
        giftId: gift.id,
      );
      setState(() {
        _tokenBalance = newBalance;
        _statusText = 'Sent ${gift.emoji} ${gift.name}!';
      });
      final sent = await widget.giftingApi.fetchSentGifts();
      setState(() => _sent = sent);
    } on GiftingApiException catch (e) {
      setState(() => _errorText = e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Gifts')),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Text('Token balance: $_tokenBalance', style: const TextStyle(fontWeight: FontWeight.bold)),
                const SizedBox(height: 12),
                TextField(
                  controller: _recipientController,
                  decoration: const InputDecoration(labelText: 'Send to (user ID)'),
                ),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final gift in _catalog)
                      ActionChip(
                        avatar: Text(gift.emoji),
                        label: Text('${gift.name} (${gift.tokenCost})'),
                        onPressed: () => _sendGift(gift),
                      ),
                  ],
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
                const Text('Received', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                if (_received.isEmpty) const Text('No gifts received yet.'),
                for (final transaction in _received)
                  ListTile(
                    leading: Text(transaction.gift.emoji, style: const TextStyle(fontSize: 24)),
                    title: Text('${transaction.gift.name} from ${transaction.otherUserName ?? 'Someone'}'),
                    subtitle: transaction.message != null ? Text(transaction.message!) : null,
                  ),
                const SizedBox(height: 16),
                const Text('Sent', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                if (_sent.isEmpty) const Text('No gifts sent yet.'),
                for (final transaction in _sent)
                  ListTile(
                    leading: Text(transaction.gift.emoji, style: const TextStyle(fontSize: 24)),
                    title: Text('${transaction.gift.name} to ${transaction.otherUserName ?? 'Someone'}'),
                  ),
              ],
            ),
    );
  }
}
