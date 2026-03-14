"use client";

import {
    useEffect,
    useRef,
    useState,
    type PointerEvent as ReactPointerEvent,
} from "react";
import ReactCrop, { type Crop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useLanguage } from "@/contexts/LanguageContext";
import {
    createNearFullCrop,
    mapOverlayRectToImageRect,
    normalizeOverlayRect,
    percentCropToPixelRect,
    percentRectToPixelRect,
    projectImageRectIntoCrop,
    type PercentRect,
    type Point2D,
} from "@/lib/image-cropper-utils";

interface ImageCropperProps {
    imageSrc: string;
    open: boolean;
    onClose: () => void;
    onCropComplete: (croppedImageBlob: Blob) => void;
}

type CropperMode = "crop" | "redact";

async function canvasToObjectUrl(canvas: HTMLCanvasElement): Promise<string> {
    const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((nextBlob) => {
            if (!nextBlob) {
                reject(new Error("Canvas is empty"));
                return;
            }
            resolve(nextBlob);
        }, "image/jpeg", 0.95);
    });

    return URL.createObjectURL(blob);
}

async function loadImageElement(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("Failed to load image for normalization"));
        image.src = src;
    });
}

async function createNormalizedImageUrl(imageSrc: string): Promise<string> {
    const response = await fetch(imageSrc);
    const blob = await response.blob();

    if (typeof createImageBitmap === "function") {
        try {
            const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
            const canvas = document.createElement("canvas");
            canvas.width = bitmap.width;
            canvas.height = bitmap.height;

            const ctx = canvas.getContext("2d");
            if (!ctx) {
                bitmap.close();
                throw new Error("Failed to get normalization canvas context");
            }

            ctx.drawImage(bitmap, 0, 0);
            bitmap.close();
            return canvasToObjectUrl(canvas);
        } catch {
            // Fallback below.
        }
    }

    const image = await loadImageElement(imageSrc);
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth || image.width;
    canvas.height = image.naturalHeight || image.height;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
        return imageSrc;
    }

    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvasToObjectUrl(canvas);
}

function getPointerPercentPoint(
    event: ReactPointerEvent<HTMLDivElement>,
    element: HTMLDivElement
): Point2D {
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
        return { x: 0, y: 0 };
    }

    return {
        x: ((event.clientX - rect.left) / rect.width) * 100,
        y: ((event.clientY - rect.top) / rect.height) * 100,
    };
}

export function ImageCropper({ imageSrc, open, onClose, onCropComplete }: ImageCropperProps) {
    const { t, language } = useLanguage();
    const [mode, setMode] = useState<CropperMode>("crop");
    const [crop, setCrop] = useState<Crop>();
    const [redactions, setRedactions] = useState<PercentRect[]>([]);
    const [draftRedaction, setDraftRedaction] = useState<PercentRect | null>(null);
    const [normalizedImageSrc, setNormalizedImageSrc] = useState<string | null>(null);

    const imgRef = useRef<HTMLImageElement>(null);
    const draftStartPointRef = useRef<Point2D | null>(null);
    const normalizedObjectUrlRef = useRef<string | null>(null);

    useEffect(() => {
        if (!open || !imageSrc) return;

        let cancelled = false;

        const normalize = async () => {
            try {
                const nextUrl = await createNormalizedImageUrl(imageSrc);
                if (cancelled) {
                    if (nextUrl !== imageSrc) {
                        URL.revokeObjectURL(nextUrl);
                    }
                    return;
                }

                if (normalizedObjectUrlRef.current) {
                    URL.revokeObjectURL(normalizedObjectUrlRef.current);
                    normalizedObjectUrlRef.current = null;
                }

                if (nextUrl !== imageSrc) {
                    normalizedObjectUrlRef.current = nextUrl;
                }

                setNormalizedImageSrc(nextUrl);
            } catch {
                setNormalizedImageSrc(imageSrc);
            }
        };

        normalize();

        return () => {
            cancelled = true;
        };
    }, [imageSrc, open]);

    useEffect(() => {
        return () => {
            if (normalizedObjectUrlRef.current) {
                URL.revokeObjectURL(normalizedObjectUrlRef.current);
            }
        };
    }, []);

    function onImageLoad() {
        const initialCrop = createNearFullCrop();
        setMode("crop");
        setCrop(initialCrop);
        setRedactions([]);
        setDraftRedaction(null);
        draftStartPointRef.current = null;
    }

    const getCroppedImg = async (
        image: HTMLImageElement,
        percentCrop: Crop,
        imageRedactions: PercentRect[]
    ): Promise<Blob | null> => {
        const pixelCrop = percentCropToPixelRect(percentCrop, image.naturalWidth, image.naturalHeight);
        const canvas = document.createElement("canvas");
        canvas.width = pixelCrop.width;
        canvas.height = pixelCrop.height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
            return null;
        }

        ctx.drawImage(
            image,
            pixelCrop.x,
            pixelCrop.y,
            pixelCrop.width,
            pixelCrop.height,
            0,
            0,
            pixelCrop.width,
            pixelCrop.height
        );

        ctx.fillStyle = "#ffffff";
        for (const imageRedaction of imageRedactions) {
            const visibleRect = projectImageRectIntoCrop(percentCrop, imageRedaction);
            if (!visibleRect) continue;
            const pixelRect = percentRectToPixelRect(visibleRect, canvas.width, canvas.height);

            ctx.fillRect(
                pixelRect.x,
                pixelRect.y,
                pixelRect.width,
                pixelRect.height
            );
        }

        return new Promise((resolve, reject) => {
            canvas.toBlob((blob) => {
                if (!blob) {
                    reject(new Error("Canvas is empty"));
                    return;
                }
                resolve(blob);
            }, "image/jpeg");
        });
    };

    const closeCropper = () => {
        setMode("crop");
        setCrop(undefined);
        setRedactions([]);
        setDraftRedaction(null);
        setNormalizedImageSrc(null);
        draftStartPointRef.current = null;
        if (normalizedObjectUrlRef.current) {
            URL.revokeObjectURL(normalizedObjectUrlRef.current);
            normalizedObjectUrlRef.current = null;
        }
        onClose();
    };

    const handleConfirm = async () => {
        const image = imgRef.current;
        const activeCrop = crop;
        if (image && activeCrop) {
            try {
                const croppedBlob = await getCroppedImg(image, activeCrop, redactions);
                if (croppedBlob) {
                    onCropComplete(croppedBlob);
                }
            } catch (error) {
                console.error(error);
            }
            return;
        }

        const fallbackSrc = normalizedImageSrc || imageSrc;
        if (fallbackSrc) {
            try {
                const res = await fetch(fallbackSrc);
                const blob = await res.blob();
                onCropComplete(blob);
            } catch (error) {
                console.error(error);
            }
        }
    };

    const handleRedactionPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (mode !== "redact") return;

        const overlay = event.currentTarget;
        const point = getPointerPercentPoint(event, overlay);
        draftStartPointRef.current = point;
        setDraftRedaction({
            x: point.x,
            y: point.y,
            width: 0,
            height: 0,
        });
        overlay.setPointerCapture(event.pointerId);
    };

    const handleRedactionPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (mode !== "redact" || !draftStartPointRef.current) return;

        const point = getPointerPercentPoint(event, event.currentTarget);
        const rect = normalizeOverlayRect(draftStartPointRef.current, point);
        setDraftRedaction(rect);
    };

    const finishRedactionDraft = () => {
        if (!crop || !draftRedaction) {
            setDraftRedaction(null);
            draftStartPointRef.current = null;
            return;
        }

        setRedactions((prev) => [...prev, mapOverlayRectToImageRect(crop, draftRedaction)]);
        setDraftRedaction(null);
        draftStartPointRef.current = null;
    };

    const handleRedactionPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (mode !== "redact") return;

        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }
        finishRedactionDraft();
    };

    const handleRedactionPointerCancel = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }
        setDraftRedaction(null);
        draftStartPointRef.current = null;
    };

    const cropLabel = language === "zh" ? "裁剪" : "Crop";
    const redactLabel = language === "zh" ? "遮挡" : "Redact";
    const undoLabel = language === "zh" ? "撤销上一步" : "Undo";
    const clearLabel = language === "zh" ? "清空遮挡" : "Clear";
    const cropHint = t.common.cropper?.hint || (language === "zh" ? "拖动选框调整裁剪区域" : "Drag to adjust crop area");
    const redactHint = language === "zh"
        ? "拖拽绘制白色遮挡块，覆盖已订正或无关内容"
        : "Drag to place white masks over corrected or unrelated content";

    return (
        <Dialog open={open} onOpenChange={(isOpen) => !isOpen && closeCropper()}>
            <DialogContent className="max-w-4xl h-[92vh] flex flex-col p-0 gap-0">
                <DialogHeader className="p-4 border-b shrink-0">
                    <DialogTitle>{t.common.cropper?.title || "Crop Image"}</DialogTitle>
                </DialogHeader>

                <div className="flex-1 bg-black w-full overflow-auto flex items-center justify-center p-4">
                    <ReactCrop
                        crop={crop}
                        disabled={mode === "redact"}
                        keepSelection
                        onChange={(_, percentCrop) => setCrop(percentCrop)}
                        className="max-h-full"
                        renderSelectionAddon={() => (
                            <div className="absolute inset-0">
                                {crop && redactions.map((rect, index) => {
                                    const projected = projectImageRectIntoCrop(crop, rect);
                                    if (!projected) return null;

                                    return (
                                        <div
                                            key={`${rect.x}-${rect.y}-${index}`}
                                            className="absolute border border-white/80 bg-white/95"
                                            style={{
                                                left: `${projected.x}%`,
                                                top: `${projected.y}%`,
                                                width: `${projected.width}%`,
                                                height: `${projected.height}%`,
                                            }}
                                        />
                                    );
                                })}
                                {draftRedaction && (
                                    <div
                                        className="absolute border border-dashed border-white bg-white/80"
                                        style={{
                                            left: `${draftRedaction.x}%`,
                                            top: `${draftRedaction.y}%`,
                                            width: `${draftRedaction.width}%`,
                                            height: `${draftRedaction.height}%`,
                                        }}
                                    />
                                )}
                                <div
                                    className={`absolute inset-0 ${mode === "redact" ? "cursor-crosshair pointer-events-auto" : "pointer-events-none"}`}
                                    onPointerDown={handleRedactionPointerDown}
                                    onPointerMove={handleRedactionPointerMove}
                                    onPointerUp={handleRedactionPointerUp}
                                    onPointerCancel={handleRedactionPointerCancel}
                                />
                            </div>
                        )}
                    >
                        <img
                            ref={imgRef}
                            alt="Crop me"
                            src={normalizedImageSrc || imageSrc}
                            onLoad={onImageLoad}
                            style={{ maxHeight: "72vh", maxWidth: "100%", objectFit: "contain" }}
                        />
                    </ReactCrop>
                </div>

                <div className="p-4 border-t bg-background shrink-0 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-2">
                            <Button
                                size="sm"
                                variant={mode === "crop" ? "default" : "outline"}
                                onClick={() => setMode("crop")}
                            >
                                {cropLabel}
                            </Button>
                            <Button
                                size="sm"
                                variant={mode === "redact" ? "default" : "outline"}
                                onClick={() => setMode("redact")}
                            >
                                {redactLabel}
                            </Button>
                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setRedactions((prev) => prev.slice(0, -1))}
                                disabled={redactions.length === 0}
                            >
                                {undoLabel}
                            </Button>
                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                    setRedactions([]);
                                    setDraftRedaction(null);
                                    draftStartPointRef.current = null;
                                }}
                                disabled={redactions.length === 0 && !draftRedaction}
                            >
                                {clearLabel}
                            </Button>
                        </div>

                        <div className="flex gap-2">
                            <Button variant="outline" onClick={closeCropper}>
                                {t.common.cancel || "Cancel"}
                            </Button>
                            <Button onClick={handleConfirm}>
                                {t.common.confirm || "Confirm"}
                            </Button>
                        </div>
                    </div>

                    <p className="text-sm text-muted-foreground">
                        {mode === "crop" ? cropHint : redactHint}
                    </p>
                </div>
            </DialogContent>
        </Dialog>
    );
}
