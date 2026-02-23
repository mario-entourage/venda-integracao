import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  // TODO: Handle ZapSign e-signature webhook
  const body = await request.json();
  console.log('ZapSign webhook received:', body);
  return NextResponse.json({ received: true });
}
