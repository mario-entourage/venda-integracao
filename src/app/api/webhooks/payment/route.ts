import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  // TODO: Handle GlobalPays/BrazilPays payment webhook
  const body = await request.json();
  console.log('Payment webhook received:', body);
  return NextResponse.json({ received: true });
}
