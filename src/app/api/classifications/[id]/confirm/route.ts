import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedClient } from '@/lib/supabase/api-client';
import { z } from 'zod';

const confirmSchema = z.object({
  is_confirmed: z.boolean(),
  confirmed_account_id: z.string().uuid().optional(),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { user, client } = await getAuthenticatedClient();
  if (!user || !client) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const parsed = confirmSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const updateData: Record<string, unknown> = {
    is_confirmed: parsed.data.is_confirmed,
  };

  if (parsed.data.confirmed_account_id) {
    updateData.confirmed_account_id = parsed.data.confirmed_account_id;
  }

  const { data, error } = await client
    .from('classification_results')
    .update(updateData)
    .eq('id', id)
    .select('*, account:accounts!classification_results_account_id_fkey(*)')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
