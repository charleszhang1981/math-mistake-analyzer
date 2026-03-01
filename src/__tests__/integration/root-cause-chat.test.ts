import { describe, expect, it } from "vitest";

import { POST as POST_UNSAVED } from "@/app/api/root-cause-chat/route";
import { POST as POST_SAVED } from "@/app/api/error-items/[id]/root-cause-chat/route";

describe("/api/root-cause-chat", () => {
    it("unsaved route is disabled in MVP", async () => {
        const response = await POST_UNSAVED();
        const data = await response.json();

        expect(response.status).toBe(410);
        expect(data.message).toBe("Root-cause chat is disabled in MVP.");
    });

    it("saved route is disabled in MVP", async () => {
        const response = await POST_SAVED();
        const data = await response.json();

        expect(response.status).toBe(410);
        expect(data.message).toBe("Root-cause chat is disabled in MVP.");
    });
});
