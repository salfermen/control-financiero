import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/server-session';
import { RegisterForm } from './register-form';

export const metadata: Metadata = { title: 'Crear cuenta' };
export const dynamic = 'force-dynamic';

export default async function RegisterPage() {
  if (await getSession()) redirect('/inicio');
  return <RegisterForm />;
}
