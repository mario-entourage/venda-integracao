import { NextResponse } from 'next/server';

export async function GET() {
  // TODO: Validate Firebase Auth session token
  return NextResponse.json({ authenticated: false });
}
