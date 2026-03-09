import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';

interface SendEmailBody {
  to: string;
  subject: string;
  html: string;
}

export async function POST(request: NextRequest) {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[send-email] RESEND_API_KEY not configured — skipping');
    return NextResponse.json({ sent: false, reason: 'no_api_key' });
  }

  let body: SendEmailBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { to, subject, html } = body;
  if (!to || !subject || !html) {
    return NextResponse.json({ error: 'Missing to, subject, or html' }, { status: 400 });
  }

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
