import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:shared_preferences/shared_preferences.dart';

const String baseUrl = 'https://tkk-token-backend.onrender.com';

void main() {
  runApp(const TKKApp());
}

class TKKApp extends StatelessWidget {
  const TKKApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'TKK Token App',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF8B1E3F)),
        useMaterial3: true,
      ),
      home: const SplashScreen(),
    );
  }
}

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> {
  @override
  void initState() {
    super.initState();
    _bootstrap();
  }

  Future<void> _bootstrap() async {
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString('auth_token');
    if (!mounted) return;
    if (token != null && token.isNotEmpty) {
      Navigator.of(context).pushReplacement(
          MaterialPageRoute(builder: (_) => const HomeScreen()));
    } else {
      Navigator.of(context).pushReplacement(
          MaterialPageRoute(builder: (_) => const LoginScreen()));
    }
  }

  @override
  Widget build(BuildContext context) {
    return const Scaffold(body: Center(child: CircularProgressIndicator()));
  }
}

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _usernameController = TextEditingController(text: 'volunteer1');
  final _pinController = TextEditingController(text: '1234');
  bool _loading = false;

  Future<void> _login() async {
    setState(() => _loading = true);
    final response = await http.post(
      Uri.parse('$baseUrl/api/login'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({
        'username': _usernameController.text.trim(),
        'pin': _pinController.text.trim(),
      }),
    );

    setState(() => _loading = false);
    if (response.statusCode == 200) {
      final data = jsonDecode(response.body);
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('auth_token', data['token']);
      await prefs.setString('user_name', data['user']['name']);
      if (!mounted) return;
      Navigator.of(context).pushReplacement(
          MaterialPageRoute(builder: (_) => const HomeScreen()));
    } else {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Invalid login details')));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Card(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text('TKK Temple Flow',
                        style: Theme.of(context).textTheme.headlineSmall),
                    const SizedBox(height: 8),
                    const Text('Volunteer login'),
                    const SizedBox(height: 24),
                    TextField(
                      controller: _usernameController,
                      decoration: const InputDecoration(
                          labelText: 'Username', border: OutlineInputBorder()),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: _pinController,
                      keyboardType: TextInputType.number,
                      obscureText: true,
                      decoration: const InputDecoration(
                          labelText: 'PIN', border: OutlineInputBorder()),
                    ),
                    const SizedBox(height: 24),
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton(
                        onPressed: _loading ? null : _login,
                        child: _loading
                            ? const CircularProgressIndicator()
                            : const Text('Sign In'),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  String? _userName;
  bool _isAdmin = false;

  @override
  void initState() {
    super.initState();
    _loadProfile();
  }

  Future<void> _loadProfile() async {
    final prefs = await SharedPreferences.getInstance();
    setState(() {
      _userName = prefs.getString('user_name') ?? 'Volunteer';
    });
    final token = prefs.getString('auth_token');
    if (token == null) return;
    final response = await http
        .get(Uri.parse('$baseUrl/api/me'), headers: {'x-auth-token': token});
    if (response.statusCode == 200) {
      final data = jsonDecode(response.body);
      setState(() {
        _isAdmin = data['user']['role'] == 'admin';
      });
    }
  }

  Future<void> _logout() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('auth_token');
    if (!mounted) return;
    Navigator.of(context).pushAndRemoveUntil(
        MaterialPageRoute(builder: (_) => const LoginScreen()),
        (route) => false);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('Hello, $_userName'),
        actions: [
          IconButton(onPressed: _logout, icon: const Icon(Icons.logout)),
        ],
      ),
      body: _isAdmin ? const AdminScreen() : const ScannerScreen(),
    );
  }
}

class ScannerScreen extends StatefulWidget {
  const ScannerScreen({super.key});

  @override
  State<ScannerScreen> createState() => _ScannerScreenState();
}

class _ScannerScreenState extends State<ScannerScreen> {
  final _manualCodeController = TextEditingController();
  bool _loading = false;
  bool _scanPaused = false;
  String? _resultText;
  bool _success = false;

  Future<void> _redeem(String tokenCode) async {
    setState(() {
      _loading = true;
      _scanPaused = true;
      _resultText = null;
    });
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString('auth_token');
    final response = await http.post(
      Uri.parse('$baseUrl/api/redeem'),
      headers: {
        'Content-Type': 'application/json',
        'x-auth-token': token ?? '',
      },
      body: jsonEncode({'tokenCode': tokenCode}),
    );

    setState(() {
      _loading = false;
    });

    if (response.statusCode == 200) {
      setState(() {
        _resultText = 'Gift handed over for $tokenCode';
        _success = true;
      });
    } else {
      final data = jsonDecode(response.body);
      setState(() {
        _resultText = data['error'] ?? 'Unable to redeem token';
        _success = false;
      });
    }

    await Future.delayed(const Duration(seconds: 2));
    if (!mounted) return;
    setState(() {
      _scanPaused = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: SingleChildScrollView(
        child: Column(
          children: [
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  children: [
                    const Text('Scan or enter a token'),
                    const SizedBox(height: 16),
                    // Square scanner box
                    Container(
                      width: 300,
                      height: 300,
                      decoration: BoxDecoration(
                        border: Border.all(
                          color: const Color(0xFF8B1E3F),
                          width: 2,
                        ),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(10),
                        child: Stack(
                          fit: StackFit.expand,
                          children: [
                            MobileScanner(
                              onDetect: (capture) {
                                if (capture.barcodes.isNotEmpty && !_loading && !_scanPaused) {
                                  final code = capture.barcodes.first.rawValue;
                                  if (code != null) {
                                    _redeem(code);
                                  }
                                }
                              },
                            ),
                            if (_scanPaused || _loading)
                              Container(
                                color: Colors.black.withOpacity(0.4),
                                child: const Center(
                                  child: CircularProgressIndicator(
                                    color: Colors.white,
                                  ),
                                ),
                              ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 20),
                    TextField(
                      controller: _manualCodeController,
                      decoration: const InputDecoration(
                        labelText: 'Or enter token code',
                        border: OutlineInputBorder(),
                      ),
                    ),
                    const SizedBox(height: 12),
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton.icon(
                        onPressed: _loading
                            ? null
                            : () => _redeem(_manualCodeController.text.trim()),
                        icon: const Icon(Icons.qr_code_2),
                        label: const Text('Redeem token'),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),
            if (_resultText != null)
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: _success ? Colors.green.shade50 : Colors.red.shade50,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  _resultText!,
                  style: TextStyle(
                      color:
                          _success ? Colors.green.shade800 : Colors.red.shade800),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class AdminScreen extends StatefulWidget {
  const AdminScreen({super.key});

  @override
  State<AdminScreen> createState() => _AdminScreenState();
}

class _AdminScreenState extends State<AdminScreen> {
  Map<String, dynamic>? _summary;
  List<dynamic> _tokens = [];
  bool _loading = false;
  bool _showScanner = false;
  final _manualCodeController = TextEditingController();
  String? _scanResultText;
  bool _scanSuccess = false;

  @override
  void initState() {
    super.initState();
    _loadAdminData();
  }

  @override
  void dispose() {
    _manualCodeController.dispose();
    super.dispose();
  }

  Future<void> _loadAdminData() async {
    setState(() => _loading = true);
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString('auth_token');
    final summaryResponse = await http.get(
        Uri.parse('$baseUrl/api/admin/summary'),
        headers: {'x-auth-token': token ?? ''});
    final tokensResponse = await http.get(
        Uri.parse('$baseUrl/api/admin/tokens'),
        headers: {'x-auth-token': token ?? ''});
    setState(() {
      _summary = jsonDecode(summaryResponse.body);
      _tokens = jsonDecode(tokensResponse.body)['tokens'];
      _loading = false;
    });
  }

  Future<void> _generateTokens() async {
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString('auth_token');
    await http.post(
      Uri.parse('$baseUrl/api/admin/tokens/generate'),
      headers: {
        'Content-Type': 'application/json',
        'x-auth-token': token ?? ''
      },
      body: jsonEncode({'count': 20}),
    );
    await _loadAdminData();
  }

  Future<void> _syncToDatabase() async {
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString('auth_token');
    final response = await http.post(
      Uri.parse('$baseUrl/api/admin/sync-fallback-to-db'),
      headers: {
        'Content-Type': 'application/json',
        'x-auth-token': token ?? ''
      },
    );

    if (!mounted) return;
    if (response.statusCode == 200) {
      final data = jsonDecode(response.body);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('✅ Synced ${data['synced']} tokens to database'),
          backgroundColor: Colors.green,
        ),
      );
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('❌ Database sync failed'),
          backgroundColor: Colors.red,
        ),
      );
    }
  }

  Future<void> _redeemToken(String tokenCode) async {
    setState(() {
      _scanResultText = null;
    });
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString('auth_token');
    final response = await http.post(
      Uri.parse('$baseUrl/api/redeem'),
      headers: {
        'Content-Type': 'application/json',
        'x-auth-token': token ?? '',
      },
      body: jsonEncode({'tokenCode': tokenCode}),
    );

    if (response.statusCode == 200) {
      setState(() {
        _scanResultText = 'Gift handed over for $tokenCode';
        _scanSuccess = true;
      });
      _manualCodeController.clear();
      await Future.delayed(const Duration(seconds: 2));
      _loadAdminData();
    } else {
      final data = jsonDecode(response.body);
      setState(() {
        _scanResultText = data['error'] ?? 'Unable to redeem token';
        _scanSuccess = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        children: [
          // Toggle buttons for Dashboard / Redeem QR
          Row(
            children: [
              Expanded(
                child: FilledButton(
                  onPressed: !_showScanner
                      ? null
                      : () => setState(() => _showScanner = false),
                  style: FilledButton.styleFrom(
                    backgroundColor: !_showScanner
                        ? const Color(0xFF8B1E3F)
                        : Colors.grey,
                  ),
                  child: const Text('Dashboard'),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: FilledButton(
                  onPressed: _showScanner
                      ? null
                      : () => setState(() => _showScanner = true),
                  style: FilledButton.styleFrom(
                    backgroundColor: _showScanner
                        ? const Color(0xFF8B1E3F)
                        : Colors.grey,
                  ),
                  child: const Text('Redeem QR'),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          // Dashboard View
          if (!_showScanner)
            Expanded(
              child: Column(
                children: [
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('Summary'),
                          const SizedBox(height: 8),
                          Text(_summary == null
                              ? 'Loading...'
                              : 'Total: ${_summary!['totalTokens']}'),
                          Text(_summary == null
                              ? ''
                              : 'Redeemed: ${_summary!['redeemed']}'),
                          Text(_summary == null
                              ? ''
                              : 'Pending: ${_summary!['pending']}'),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(
                        child: FilledButton.icon(
                          onPressed: _generateTokens,
                          icon: const Icon(Icons.add),
                          label: const Text('Generate batch'),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: FilledButton.icon(
                          onPressed: _syncToDatabase,
                          icon: const Icon(Icons.cloud_upload),
                          label: const Text('Sync to DB'),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  Expanded(
                    child: _loading
                        ? const Center(child: CircularProgressIndicator())
                        : ListView.builder(
                            itemCount: _tokens.length,
                            itemBuilder: (context, index) {
                              final token = _tokens[index];
                              final redeemed = token['status'] == 'redeemed';
                              return ListTile(
                                title: Text(token['tokenCode']),
                                subtitle: Text(redeemed
                                    ? 'Redeemed by ${token['redeemedBy']}'
                                    : 'Pending'),
                                trailing: Icon(
                                    redeemed
                                        ? Icons.check_circle
                                        : Icons.pending_actions,
                                    color: redeemed
                                        ? Colors.green
                                        : Colors.orange),
                              );
                            },
                          ),
                  ),
                ],
              ),
            ),
          // Scanner View
          if (_showScanner)
            Expanded(
              child: SingleChildScrollView(
                child: Column(
                  children: [
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          children: [
                            const Text('Scan or enter a token'),
                            const SizedBox(height: 16),
                            // Square scanner box
                            Container(
                              width: 300,
                              height: 300,
                              decoration: BoxDecoration(
                                border: Border.all(
                                  color: const Color(0xFF8B1E3F),
                                  width: 2,
                                ),
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: ClipRRect(
                                borderRadius: BorderRadius.circular(10),
                                child: MobileScanner(
                                  onDetect: (capture) {
                                    if (capture.barcodes.isNotEmpty) {
                                      final code = capture.barcodes.first.rawValue;
                                      if (code != null) {
                                        _redeemToken(code);
                                      }
                                    }
                                  },
                                ),
                              ),
                            ),
                            const SizedBox(height: 20),
                            TextField(
                              controller: _manualCodeController,
                              decoration: const InputDecoration(
                                labelText: 'Or enter token code',
                                border: OutlineInputBorder(),
                              ),
                            ),
                            const SizedBox(height: 12),
                            SizedBox(
                              width: double.infinity,
                              child: FilledButton.icon(
                                onPressed: () =>
                                    _redeemToken(_manualCodeController.text.trim()),
                                icon: const Icon(Icons.qr_code_2),
                                label: const Text('Redeem token'),
                              ),
                            ),
                            const SizedBox(height: 16),
                            if (_scanResultText != null)
                              Container(
                                width: double.infinity,
                                padding: const EdgeInsets.all(16),
                                decoration: BoxDecoration(
                                  color: _scanSuccess
                                      ? Colors.green.shade50
                                      : Colors.red.shade50,
                                  borderRadius: BorderRadius.circular(12),
                                ),
                                child: Text(
                                  _scanResultText!,
                                  style: TextStyle(
                                    color: _scanSuccess
                                        ? Colors.green.shade800
                                        : Colors.red.shade800,
                                  ),
                                ),
                              ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),              ),            ),
        ],
      ),
    );
  }
}
