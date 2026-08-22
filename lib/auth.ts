import { NextRequest } from 'next/server';
import { getAnonClient, getServiceClient } from './supabase';

export interface AuthedUser {
  id: string;
  role: 'user' | 'admin' | 'support';
  kycTier: number;
  isActive: boolean;
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

export async function requireUser(req: NextRequest): Promise<AuthedUser> {
  const authHeader = req.headers.get('authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) throw new AuthError('Missing bearer token', 401);

  const anon = getAnonClient();
  const { data, error } = await anon.auth.getUser(token);
  if (error || !data?.user) throw new AuthError('Invalid or expired session', 401);

  const service = getServiceClient();
  const { data: profile, error: profileError } = await service
    .from('profiles')
    .select('id, role, kyc_tier, is_active')
    .eq('id', data.user.id)
    .single();

  if (profileError || !profile) throw new AuthError('Profile not found', 401);
  if (!profile.is_active) throw new AuthError('Account is suspended', 403);

  return { id: profile.id, role: profile.role, kycTier: profile.kyc_tier, isActive: profile.is_active };
}

export async function requireAdmin(req: NextRequest): Promise<AuthedUser> {
  const user = await requireUser(req);
  if (user.role !== 'admin') throw new AuthError('Admin access required', 403);
  return user;
}
