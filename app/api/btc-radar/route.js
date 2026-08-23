
import { NextResponse } from "next/server";
import { analyzeBtc } from "../btc-strategy";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET() {
  try {
    return NextResponse.json(
      await analyzeBtc()
    );
  } catch (error) {
    console.error("BTC radar hatası:", error);

    return NextResponse.json(
      {
        ok: false,
        error:
          error?.message ||
          "BTC analizi üretilemedi.",
      },
      { status: 500 }
    );
  }
}
