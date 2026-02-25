import { NextResponse } from "next/server";
import { getAppConfig } from "@/lib/config";
import { internalError } from "@/lib/api-errors";
import { createLogger } from "@/lib/logger";

const logger = createLogger('api:settings');

export const dynamic = 'force-dynamic';

export async function GET() {
    const config = getAppConfig();
    // Return full config including API keys since this is an authenticated endpoint
    return NextResponse.json(config);
}

export async function POST(req: Request) {
    try {
        await req.json(); // consume body for consistent API behavior
        return NextResponse.json(
            { message: "CONFIG_ENV_ONLY" },
            { status: 400 }
        );
    } catch (error) {
        logger.error({ error }, 'Failed to update settings');
        return internalError("Failed to update settings");
    }
}


