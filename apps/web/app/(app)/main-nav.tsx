'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/inicio', label: 'Inicio' },
  { href: '/cuentas', label: 'Cuentas' },
  { href: '/movimientos', label: 'Movimientos' },
] as const;

export function MainNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Principal"
      className="order-last w-full overflow-x-auto sm:order-none sm:w-auto"
    >
      <ul className="flex gap-1">
        {LINKS.map((link) => {
          const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className={`block rounded-lg px-3 py-1.5 text-sm font-medium ${active ? 'bg-accent-surface text-accent' : 'text-text-muted hover:text-text'}`}
              >
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
