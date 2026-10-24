/// Changing what customers see.
///
/// A kitchen registers once, in a hurry, and then lives with whatever it
/// typed: the name over the shop, the street it is on, what it says it
/// cooks. Until this screen there was no way to correct any of it from the
/// app - a misspelt name was permanent, and a kitchen that moved had to ask
/// someone with database access.
///
/// Only what changed is sent, so a field this screen does not ask about -
/// opening hours, the photographs - is never quietly blanked by saving.
library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lokshineats_core/network/api_exception.dart';
import 'package:lokshineats_core/utils/money.dart';

import '../models/store.dart';
import '../providers/store_providers.dart';

class EditStorePage extends ConsumerStatefulWidget {
  const EditStorePage({super.key, required this.store});

  final Store store;

  @override
  ConsumerState<EditStorePage> createState() => _EditStorePageState();
}

class _EditStorePageState extends ConsumerState<EditStorePage> {
  final _formKey = GlobalKey<FormState>();

  late final _name = TextEditingController(text: widget.store.name);
  late final _cuisine = TextEditingController(text: widget.store.cuisine);
  late final _description = TextEditingController(
    text: widget.store.description,
  );
  late final _address = TextEditingController(text: widget.store.address);
  late final _city = TextEditingController(text: widget.store.city);
  late final _phone = TextEditingController(text: widget.store.phone ?? '');
  late final _deliveryTime = TextEditingController(
    text: widget.store.deliveryTime,
  );
  late final _deliveryFee = TextEditingController(
    text: widget.store.deliveryFee.toStringAsFixed(2),
  );
  late final _minOrder = TextEditingController(
    text: widget.store.minOrderAmount.toStringAsFixed(2),
  );

  bool _busy = false;

  @override
  void dispose() {
    for (final controller in [
      _name,
      _cuisine,
      _description,
      _address,
      _city,
      _phone,
      _deliveryTime,
      _deliveryFee,
      _minOrder,
    ]) {
      controller.dispose();
    }
    super.dispose();
  }

  /// The value if it changed, or null to leave it alone.
  String? _changed(TextEditingController controller, String current) {
    final value = controller.text.trim();
    return value == current.trim() ? null : value;
  }

  double? _changedAmount(TextEditingController controller, double current) {
    final value = double.tryParse(controller.text.trim().replaceAll(',', '.'));
    if (value == null) return null;
    return (value - current).abs() < 0.005 ? null : value;
  }

  Future<void> _save() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;

    setState(() => _busy = true);
    final messenger = ScaffoldMessenger.of(context);
    final navigator = Navigator.of(context);

    try {
      await ref
          .read(myStoreProvider.notifier)
          .updateDetails(
            name: _changed(_name, widget.store.name),
            cuisine: _changed(_cuisine, widget.store.cuisine),
            description: _changed(_description, widget.store.description),
            address: _changed(_address, widget.store.address),
            city: _changed(_city, widget.store.city),
            phone: _changed(_phone, widget.store.phone ?? ''),
            deliveryTime: _changed(_deliveryTime, widget.store.deliveryTime),
            deliveryFee: _changedAmount(_deliveryFee, widget.store.deliveryFee),
            minOrderAmount: _changedAmount(
              _minOrder,
              widget.store.minOrderAmount,
            ),
          );

      messenger.showSnackBar(
        const SnackBar(content: Text('Your kitchen has been updated')),
      );
      navigator.pop();
    } on ApiException catch (error) {
      // The API says which field is wrong; passing that on is the difference
      // between a fixable form and a dead end.
      messenger.showSnackBar(
        SnackBar(content: Text(error.firstFieldError ?? error.message)),
      );
    } catch (_) {
      messenger.showSnackBar(
        const SnackBar(content: Text('Could not save that. Try again.')),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(title: const Text('Your kitchen')),
      body: SafeArea(
        child: Form(
          key: _formKey,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 20, 20, 32),
            children: [
              Text(
                'What customers see',
                style: theme.textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _name,
                textCapitalization: TextCapitalization.words,
                decoration: const InputDecoration(labelText: 'Kitchen name'),
                validator: (value) => (value ?? '').trim().length < 2
                    ? 'Your kitchen needs a name.'
                    : null,
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _cuisine,
                textCapitalization: TextCapitalization.words,
                decoration: const InputDecoration(
                  labelText: 'What you cook',
                  helperText: 'Kota Specialist, Traditional Township Food…',
                ),
                validator: (value) =>
                    (value ?? '').trim().isEmpty ? 'Say what you cook.' : null,
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _description,
                maxLines: 4,
                maxLength: 500,
                textCapitalization: TextCapitalization.sentences,
                decoration: const InputDecoration(
                  labelText: 'About your kitchen',
                ),
              ),

              const SizedBox(height: 8),
              Text(
                'Where you are',
                style: theme.textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _address,
                textCapitalization: TextCapitalization.words,
                decoration: const InputDecoration(labelText: 'Street address'),
                validator: (value) => (value ?? '').trim().length < 3
                    ? 'Drivers need an address to collect from.'
                    : null,
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _city,
                textCapitalization: TextCapitalization.words,
                decoration: const InputDecoration(
                  labelText: 'Township or city',
                ),
                validator: (value) =>
                    (value ?? '').trim().isEmpty ? 'Which area?' : null,
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _phone,
                keyboardType: TextInputType.phone,
                decoration: const InputDecoration(
                  labelText: 'Phone',
                  helperText: 'For drivers and LokshinEats, not customers.',
                ),
              ),

              const SizedBox(height: 24),
              Text(
                'Delivery',
                style: theme.textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _deliveryTime,
                decoration: const InputDecoration(
                  labelText: 'How long you take',
                  helperText: '30-45 min',
                ),
                validator: (value) => (value ?? '').trim().length < 3
                    ? 'Give customers an idea of the wait.'
                    : null,
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(
                    child: TextFormField(
                      controller: _deliveryFee,
                      keyboardType: const TextInputType.numberWithOptions(
                        decimal: true,
                      ),
                      inputFormatters: [
                        FilteringTextInputFormatter.allow(RegExp(r'[0-9.,]')),
                      ],
                      decoration: const InputDecoration(
                        labelText: 'Delivery fee',
                        prefixText: 'R ',
                      ),
                      validator: _amount,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: TextFormField(
                      controller: _minOrder,
                      keyboardType: const TextInputType.numberWithOptions(
                        decimal: true,
                      ),
                      inputFormatters: [
                        FilteringTextInputFormatter.allow(RegExp(r'[0-9.,]')),
                      ],
                      decoration: const InputDecoration(
                        labelText: 'Minimum order',
                        prefixText: 'R ',
                      ),
                      validator: _amount,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                'Most of the delivery fee goes to the driver who brings the '
                'food. Orders already placed keep the fee they were placed '
                'at: ${formatRands(widget.store.deliveryFee)} today.',
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),

              const SizedBox(height: 28),
              FilledButton(
                onPressed: _busy ? null : _save,
                child: _busy
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Text('Save'),
              ),

              const SizedBox(height: 16),
              Text(
                'Your photographs are set by LokshinEats for now. Send us the '
                'picture you want on your page and we will put it up.',
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  String? _amount(String? value) {
    final parsed = double.tryParse((value ?? '').trim().replaceAll(',', '.'));
    if (parsed == null) return 'Enter an amount.';
    if (parsed < 0) return 'That cannot be less than nothing.';
    return null;
  }
}
