import { apiClient } from "@/lib/api-client";

export type UploadImageKind = "raw" | "crop" | "answer";

export interface ImageUploadResult {
    key: string;
    signedUrl: string;
}

export async function uploadImageToStorage(file: File, kind: UploadImageKind): Promise<ImageUploadResult> {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("kind", kind);
    return apiClient.postForm<ImageUploadResult>("/api/images/upload", formData);
}
