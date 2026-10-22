/// The app's home, with the website's bottom navigation.
///
/// The site carries Home, Search, Orders, Favorites and Profile along the
/// bottom, and someone who orders on the site should find the app laid out
/// the way they already know it.
///
/// One difference, deliberately: the site's Search tab opens its restaurant
/// list, which here *is* the Home tab - it already has the search field at
/// the top. A second tab leading to the same screen would be a tab that does
/// nothing, so there are four.
///
/// Tabs keep their state while you move between them, so a half-typed search
/// or a scrolled list is still there when you come back.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lokshineats_core/auth/auth_providers.dart';

import '../../auth/pages/account_page.dart';
import '../../favourites/pages/favourites_page.dart';
import '../../orders/pages/your_orders_page.dart';
import '../../stores/pages/stores_page.dart';

class HomeShell extends ConsumerStatefulWidget {
  const HomeShell({super.key});

  @override
  ConsumerState<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends ConsumerState<HomeShell> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    // Orders and favourites both need an account. Rather than offer tabs that
    // can only say "sign in", a signed-out customer gets browsing and the
    // account tab, which is where signing in happens.
    final signedIn = ref.watch(isSignedInProvider);

    final destinations = <_Destination>[
      const _Destination(
        icon: Icons.home_outlined,
        selectedIcon: Icons.home_rounded,
        label: 'Home',
        page: StoresPage(),
      ),
      if (signedIn) ...[
        const _Destination(
          icon: Icons.receipt_long_outlined,
          selectedIcon: Icons.receipt_long_rounded,
          label: 'Orders',
          page: YourOrdersPage(),
        ),
        const _Destination(
          icon: Icons.favorite_border_rounded,
          selectedIcon: Icons.favorite_rounded,
          label: 'Favourites',
          page: FavouritesPage(),
        ),
      ],
      const _Destination(
        icon: Icons.person_outline_rounded,
        selectedIcon: Icons.person_rounded,
        label: 'Account',
        page: AccountPage(),
      ),
    ];

    // Signing out removes two tabs; whoever was on one of them lands on Home
    // rather than on an index that no longer exists.
    final index = _index.clamp(0, destinations.length - 1);

    return Scaffold(
      body: IndexedStack(
        index: index,
        children: [for (final destination in destinations) destination.page],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: index,
        onDestinationSelected: (next) => setState(() => _index = next),
        destinations: [
          for (final destination in destinations)
            NavigationDestination(
              icon: Icon(destination.icon),
              selectedIcon: Icon(destination.selectedIcon),
              label: destination.label,
            ),
        ],
      ),
    );
  }
}

class _Destination {
  const _Destination({
    required this.icon,
    required this.selectedIcon,
    required this.label,
    required this.page,
  });

  final IconData icon;
  final IconData selectedIcon;
  final String label;
  final Widget page;
}
