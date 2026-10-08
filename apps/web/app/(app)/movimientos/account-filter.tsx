'use client';

import { useRouter } from 'next/navigation';

export function AccountFilter({
  month,
  selected,
  accounts,
}: {
  month: string;
  selected: string;
  accounts: { id: string; name: string }[];
}) {
  const router = useRouter();
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-text-muted">Cuenta</span>
      <select
        value={selected}
        onChange={(event) => {
          const id = event.target.value;
          router.push(`/movimientos?mes=${month}${id ? `&cuenta=${id}` : ''}`);
        }}
        className="rounded-lg border border-border bg-surface px-3 py-2"
      >
        <option value="">Todas</option>
        {accounts.map((account) => (
          <option key={account.id} value={account.id}>
            {account.name}
          </option>
        ))}
      </select>
    </label>
  );
}
