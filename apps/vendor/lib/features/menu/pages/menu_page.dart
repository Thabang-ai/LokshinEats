/// The kitchen's menu.
///
/// The switch on each dish is the thing a kitchen touches most: running out
/// of chips mid-service is a daily event, and turning a dish off is how it
/// stops customers ordering what it cannot make. Editing and removing sit
/// one tap further in, because they are the rarer, more deliberate changes.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lokshineats_core/network/api_exception.dart';
import 'package:lokshineats_core/theme/app_theme.dart';
import 'package:lokshineats_core/utils/money.dart';
import 'package:lokshineats_core/widgets/async_states.dart';

import '../models/menu_item.dart';
import '../providers/menu_providers.dart';
import 'menu_item_form_page.dart';

class MenuPage extends ConsumerWidget {
  const MenuPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final menu = ref.watch(menuProvider);

    return Scaffold(
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _openForm(context),
        icon: const Icon(Icons.add),
        label: const Text('Add a dish'),
      ),
      body: menu.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => ErrorState(
          error: error,
          onRetry: () => ref.invalidate(menuProvider),
        ),
        data: (items) => RefreshIndicator(
          onRefresh: ref.read(menuProvider.notifier).refresh,
          child: items.isEmpty
              ? ListView(
                  padding: const EdgeInsets.fromLTRB(24, 60, 24, 24),
                  children: const [
                    EmptyState(
                      title: 'Your menu is empty',
                      subtitle:
                          'Customers cannot order from you until there is '
                          'something to order. Add your first dish.',
                      emoji: '🍲',
                    ),
                  ],
                )
              : ListView(
                  // Room for the button to sit over the last dish without
                  // hiding its switch.
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
                  children: [
                    _SoldOutSummary(items: items),
                    for (final section in _sections(items)) ...[
                      Padding(
                        padding: const EdgeInsets.only(top: 12, bottom: 8),
                        child: Text(
                          section.key,
                          style: Theme.of(context).textTheme.titleSmall
                              ?.copyWith(fontWeight: FontWeight.w800),
                        ),
                      ),
                      for (final item in section.value)
                        _MenuRow(
                          item: item,
                          onTap: () => _openForm(context, item: item),
                        ),
                    ],
                  ],
                ),
        ),
      ),
    );
  }

  static void _openForm(BuildContext context, {MenuItem? item}) {
    Navigator.of(context).push(
      MaterialPageRoute<void>(builder: (_) => MenuItemFormPage(item: item)),
    );
  }

  /// Items grouped by category, in the order they are already sorted.
  static List<MapEntry<String, List<MenuItem>>> _sections(
    List<MenuItem> items,
  ) {
    final sections = <String, List<MenuItem>>{};
    for (final item in items) {
      sections.putIfAbsent(item.category, () => []).add(item);
    }
    return sections.entries.toList();
  }
}

/// A line at the top when anything is switched off, so a kitchen that turned
/// dishes off at lunch sees it before the dinner rush rather than after.
class _SoldOutSummary extends StatelessWidget {
  const _SoldOutSummary({required this.items});

  final List<MenuItem> items;

  @override
  Widget build(BuildContext context) {
    final off = items.where((i) => !i.available).length;
    if (off == 0) return const SizedBox.shrink();

    final theme = Theme.of(context);
    final status = StatusColors.of(context);

    return Container(
      padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
      decoration: BoxDecoration(
        color: status.warning.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        off == 1
            ? '1 dish is switched off. Customers cannot order it.'
            : '$off dishes are switched off. Customers cannot order them.',
        style: theme.textTheme.bodyMedium?.copyWith(
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}

class _MenuRow extends ConsumerStatefulWidget {
  const _MenuRow({required this.item, required this.onTap});

  final MenuItem item;
  final VoidCallback onTap;

  @override
  ConsumerState<_MenuRow> createState() => _MenuRowState();
}

class _MenuRowState extends ConsumerState<_MenuRow> {
  bool _busy = false;

  Future<void> _toggle(bool available) async {
    setState(() => _busy = true);
    final messenger = ScaffoldMessenger.of(context);

    try {
      await ref
          .read(menuProvider.notifier)
          .setAvailable(widget.item.id, available: available);
      messenger.hideCurrentSnackBar();
      messenger.showSnackBar(
        SnackBar(
          content: Text(
            available
                ? '${widget.item.name} is back on.'
                : '${widget.item.name} is off. Customers cannot order it.',
          ),
        ),
      );
    } on ApiException catch (error) {
      messenger.showSnackBar(SnackBar(content: Text(error.message)));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final item = widget.item;
    final muted = theme.colorScheme.onSurfaceVariant;

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: InkWell(
        onTap: widget.onTap,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 10, 8, 10),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      item.name,
                      style: theme.textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w700,
                        color: item.available ? null : muted,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      [
                        formatRands(item.price),
                        '${item.preparationTime} min',
                        if (item.isVegetarian) 'Vegetarian',
                        if (item.isSpicy) 'Spicy',
                        if (!item.available) 'Switched off',
                      ].join(' · '),
                      style: theme.textTheme.bodySmall?.copyWith(color: muted),
                    ),
                  ],
                ),
              ),
              Semantics(
                label: item.available
                    ? 'Switch ${item.name} off'
                    : 'Switch ${item.name} back on',
                child: Switch(
                  value: item.available,
                  onChanged: _busy ? null : _toggle,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
