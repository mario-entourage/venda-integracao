import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Resend } from 'resend';
import { requireAuth } from '../../_require-auth';
import { validateBody } from '../../_validate';

const BodySchema = z.object({
  to: z.string().email('Invalid recipient email address'),
  subject: z.string().min(1, 'subject is required'),
  html: z.string().min(1, 'html is required'),
});

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;

  if (!process.env.RESEND_API_KEY) {
    console.warn('[send-email] RESEND_API_KEY not configured — skipping');
    return NextResponse.json({ sent: false, reason: 'no_api_key' });
  }

  const body = await validateBody(request, BodySchema);
  if (body instanceof Response) return body;

  const { to, subject, html } = body;

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { data, error } = await resend.emails.send({
      from: 'Entourage Lab <noreply@entouragelab.com>',
      to,
      subject,
      html,
    });

    if (error) {
      console.error('[send-email] Resend error:', error);
      return NextResponse.json({ sent: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ sent: true, id: data?.id });
  } catch (err) {
    console.error('[send-email] Unexpected error:', err);
    return NextResponse.json({ sent: false, error: 'Internal error' }, { status: 500 });
  }
}
