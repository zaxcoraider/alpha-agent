'use client';

import { createContext, useContext, useEffect, useState } from 'react';

// Shared nav state: desktop collapse (persisted) + mobile drawer open.
type NavState = {
  collapsed: boolean;
  toggleCollapsed: () => void;
  mobileOpen: boolean;
  setMobileOpen: (v: boolean) => void;
};

const NavCtx = createContext<NavState | null>(null);
const LS_KEY = 'plantir.sidebar.collapsed.v1';

export function NavProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Hydrate collapse pref after mount (avoids SSR/CSR mismatch).
  useEffect(() => {
    try {
      if (localStorage.getItem(LS_KEY) === '1') setCollapsed(true);
    } catch {/* ignore */}
  }, []);

  const toggleCollapsed = () =>
    setCollapsed((c) => {
      const next = !c;
      try { localStorage.setItem(LS_KEY, next ? '1' : '0'); } catch {/* ignore */}
      return next;
    });

  return (
    <NavCtx.Provider value={{ collapsed, toggleCollapsed, mobileOpen, setMobileOpen }}>
      {children}
    </NavCtx.Provider>
  );
}

export function useNav(): NavState {
  const ctx = useContext(NavCtx);
  if (!ctx) throw new Error('useNav must be used within <NavProvider>');
  return ctx;
}
