export const DEFAULT_NOTEBOOK_ID_KEY = "default-notebook-id";

export function getDefaultNotebookId(): string | null {
    if (typeof window === "undefined") return null;
    try {
        return localStorage.getItem(DEFAULT_NOTEBOOK_ID_KEY);
    } catch {
        return null;
    }
}

export function setDefaultNotebookId(id: string): void {
    if (typeof window === "undefined") return;
    try {
        localStorage.setItem(DEFAULT_NOTEBOOK_ID_KEY, id);
    } catch {
        // Ignore storage write failures (e.g. privacy mode)
    }
}

