export function extractStorageKeyFromImageRef(
    imageRef: string | null | undefined
): string | null {
    if (typeof imageRef !== "string") return null;
    const trimmed = imageRef.trim();
    if (!trimmed) return null;

    if (trimmed.startsWith("storage:")) {
        const key = trimmed.slice("storage:".length).trim();
        return key || null;
    }

    let parsed: URL;
    try {
        parsed = new URL(trimmed);
    } catch {
        return null;
    }

    const pathMatch = parsed.pathname.match(
        /^\/storage\/v1\/object\/(?:sign|public|authenticated)\/([^/]+)\/(.+)$/
    );
    if (!pathMatch) return null;

    const encodedKey = pathMatch[2];
    try {
        return decodeURIComponent(encodedKey);
    } catch {
        return encodedKey;
    }
}
