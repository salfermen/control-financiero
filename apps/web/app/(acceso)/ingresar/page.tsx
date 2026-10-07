import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/server-session';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Ingresar' };
export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  if (await getSession()) redirect('/inicio');
  return <LoginForm />;
}
