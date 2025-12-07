import 'package:flutter/material.dart';
import '../services/verification_history_service.dart';
import 'package:intl/intl.dart';

class VerificationHistoryScreen extends StatefulWidget {
  const VerificationHistoryScreen({super.key});

  @override
  State<VerificationHistoryScreen> createState() => _VerificationHistoryScreenState();
}

class _VerificationHistoryScreenState extends State<VerificationHistoryScreen> {
  List<VerificationRecord> _history = [];
  bool _isLoading = true;
  String _filter = 'all'; // 'all', 'verified', 'failed'

  @override
  void initState() {
    super.initState();
    _loadHistory();
  }

  Future<void> _loadHistory() async {
    setState(() {
      _isLoading = true;
    });

    try {
      List<VerificationRecord> history;
      if (_filter == 'verified') {
        history = await VerificationHistoryService.getHistoryFiltered(verified: true);
      } else if (_filter == 'failed') {
        history = await VerificationHistoryService.getHistoryFiltered(verified: false);
      } else {
        history = await VerificationHistoryService.getHistory();
      }

      setState(() {
        _history = history;
        _isLoading = false;
      });
    } catch (e) {
      setState(() {
        _isLoading = false;
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Błąd podczas ładowania historii: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  Future<void> _clearHistory() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Wyczyść historię'),
        content: const Text('Czy na pewno chcesz usunąć całą historię weryfikacji?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Anuluj'),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Wyczyść', style: TextStyle(color: Colors.red)),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      await VerificationHistoryService.clearHistory();
      _loadHistory();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Historia została wyczyszczona'),
            backgroundColor: Colors.green,
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Historia weryfikacji'),
        actions: [
          // Filtry
          PopupMenuButton<String>(
            icon: const Icon(Icons.filter_list),
            onSelected: (value) {
              setState(() {
                _filter = value;
              });
              _loadHistory();
            },
            itemBuilder: (context) => [
              const PopupMenuItem(
                value: 'all',
                child: Text('Wszystkie'),
              ),
              const PopupMenuItem(
                value: 'verified',
                child: Text('Zweryfikowane'),
              ),
              const PopupMenuItem(
                value: 'failed',
                child: Text('Nieudane'),
              ),
            ],
          ),
          // Wyczyść historię
          IconButton(
            icon: const Icon(Icons.delete_outline),
            onPressed: _history.isEmpty ? null : _clearHistory,
            tooltip: 'Wyczyść historię',
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _history.isEmpty
              ? _buildEmptyState()
              : _buildHistoryList(),
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            Icons.history,
            size: 64,
            color: Colors.grey[400],
          ),
          const SizedBox(height: 16),
          Text(
            'Brak historii weryfikacji',
            style: TextStyle(
              fontSize: 18,
              color: Colors.grey[600],
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Historia weryfikacji pojawi się tutaj\nafter pierwszej weryfikacji',
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 14,
              color: Colors.grey[500],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildHistoryList() {
    return Column(
      children: [
        // Statystyki
        Container(
          padding: const EdgeInsets.all(16),
          color: Colors.grey[100],
          child: FutureBuilder<Map<String, int>>(
            future: VerificationHistoryService.getStatistics(),
            builder: (context, snapshot) {
              if (!snapshot.hasData) {
                return const SizedBox.shrink();
              }
              final stats = snapshot.data!;
              return Row(
                mainAxisAlignment: MainAxisAlignment.spaceAround,
                children: [
                  _buildStatItem('Wszystkie', stats['total'] ?? 0, Colors.blue),
                  _buildStatItem('Sukces', stats['verified'] ?? 0, Colors.green),
                  _buildStatItem('Błędy', stats['failed'] ?? 0, Colors.red),
                ],
              );
            },
          ),
        ),
        // Lista
        Expanded(
          child: ListView.builder(
            itemCount: _history.length,
            padding: const EdgeInsets.all(8),
            itemBuilder: (context, index) {
              final record = _history[index];
              return _buildHistoryItem(record);
            },
          ),
        ),
      ],
    );
  }

  Widget _buildStatItem(String label, int count, Color color) {
    return Column(
      children: [
        Text(
          count.toString(),
          style: TextStyle(
            fontSize: 24,
            fontWeight: FontWeight.bold,
            color: color,
          ),
        ),
        Text(
          label,
          style: TextStyle(
            fontSize: 12,
            color: Colors.grey[600],
          ),
        ),
      ],
    );
  }

  Widget _buildHistoryItem(VerificationRecord record) {
    final dateFormat = DateFormat('dd.MM.yyyy HH:mm');
    final isVerified = record.verified;

    return Card(
      margin: const EdgeInsets.symmetric(vertical: 4, horizontal: 8),
      child: ListTile(
        leading: Container(
          width: 48,
          height: 48,
          decoration: BoxDecoration(
            color: isVerified
                ? Colors.green.withOpacity(0.1)
                : Colors.red.withOpacity(0.1),
            shape: BoxShape.circle,
          ),
          child: Icon(
            isVerified ? Icons.check_circle : Icons.error,
            color: isVerified ? Colors.green : Colors.red,
          ),
        ),
        title: Text(
          record.message,
          style: TextStyle(
            fontWeight: FontWeight.w500,
            color: isVerified ? Colors.green[700] : Colors.red[700],
          ),
        ),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SizedBox(height: 4),
            Text(
              dateFormat.format(record.timestamp),
              style: TextStyle(
                fontSize: 12,
                color: Colors.grey[600],
              ),
            ),
            if (record.deviceName != null) ...[
              const SizedBox(height: 2),
              Text(
                'Urządzenie: ${record.deviceName}',
                style: TextStyle(
                  fontSize: 11,
                  color: Colors.grey[500],
                ),
              ),
            ],
            if (record.errorType != null) ...[
              const SizedBox(height: 2),
              Text(
                'Typ błędu: ${record.errorType}',
                style: TextStyle(
                  fontSize: 11,
                  color: Colors.orange[700],
                ),
              ),
            ],
          ],
        ),
        trailing: IconButton(
          icon: const Icon(Icons.info_outline),
          onPressed: () => _showRecordDetails(record),
        ),
        isThreeLine: true,
      ),
    );
  }

  void _showRecordDetails(VerificationRecord record) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(record.verified ? 'Zweryfikowane' : 'Błąd weryfikacji'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _buildDetailRow('Status', record.verified ? 'Zweryfikowane' : 'Nieudane'),
              _buildDetailRow('Wiadomość', record.message),
              _buildDetailRow('Data', DateFormat('dd.MM.yyyy HH:mm:ss').format(record.timestamp)),
              if (record.deviceName != null)
                _buildDetailRow('Urządzenie', record.deviceName!),
              if (record.errorType != null)
                _buildDetailRow('Typ błędu', record.errorType!),
              if (record.verificationResult != null) ...[
                const SizedBox(height: 16),
                const Text(
                  'Instrukcje:',
                  style: TextStyle(fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 8),
                ...(record.verificationResult!['instructions'] as List<dynamic>?)
                        ?.map((instruction) => Padding(
                              padding: const EdgeInsets.only(bottom: 4),
                              child: Row(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  const Text('• '),
                                  Expanded(child: Text(instruction.toString())),
                                ],
                              ),
                            )) ??
                    [],
              ],
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Zamknij'),
          ),
        ],
      ),
    );
  }

  Widget _buildDetailRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 100,
            child: Text(
              '$label:',
              style: const TextStyle(fontWeight: FontWeight.bold),
            ),
          ),
          Expanded(
            child: Text(value),
          ),
        ],
      ),
    );
  }
}

