import { NextResponse } from "next/server";

export async function POST() {
    return NextResponse.json(
        { message: "Root-cause chat is disabled in MVP." },
        { status: 410 }
    );
}
