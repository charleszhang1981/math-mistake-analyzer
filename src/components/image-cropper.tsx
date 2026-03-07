"use client";

import {
    useRef,
    useState,
    type PointerEvent as ReactPointerEvent,
    type SyntheticEvent,
} from "react";
import ReactCrop, { type Crop, type PixelCrop, convertToPixelCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useLanguage } from "@/contexts/LanguageContext";
import {
    createNearFullCrop,
    mapOverlayRectToImageRect,
    normalizeOverlayRect,
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
    const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
    const [redactions, setRedactions] = useState<PercentRect[]>([]);
    const [draftRedaction, setDraftRedaction] = useState<PercentRect | null>(null);

    const imgRef = useRef<HTMLImageElement>(null);
    const draftStartPointRef = useRef<Point2D | null>(null);

    function onImageLoad(e: SyntheticEvent<HTMLImageElement>) {
        const { width, height } = e.currentTarget;
        const initialCrop = createNearFullCrop();
        setMode("crop");
        setRedactions([]);
        setDraftRedaction(null);
        draftStartPointRef.current = null;
        setCrop(initialCrop);
        setCompletedCrop(convertToPixelCrop(initialCrop, width, height));
    }

    const getCroppedImg = async (
        image: HTMLImageElement,
        pixelCrop: PixelCrop,
        percentCrop: Crop,
        imageRedactions: PercentRect[]
    ): Promise<Blob | null> => {
        const canvas = document.createElement("canvas");
        const scaleX = image.naturalWidth / image.width;
        const scaleY = image.naturalHeight / image.height;

        canvas.width = pixelCrop.width * scaleX;
        canvas.height = pixelCrop.height * scaleY;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
            return null;
        }

        ctx.drawImage(
            image,
            pixelCrop.x * scaleX,
            pixelCrop.y * scaleY,
            pixelCrop.width * scaleX,
            pixelCrop.height * scaleY,
            0,
            0,
            pixelCrop.width * scaleX,
            pixelCrop.height * scaleY
        );

        ctx.fillStyle = "#ffffff";
        for (const imageRedaction of imageRedactions) {
            const visibleRect = projectImageRectIntoCrop(percentCrop, imageRedaction);
            if (!visibleRect) continue;

            ctx.fillRect(
                (visibleRect.x / 100) * canvas.width,
                (visibleRect.y / 100) * canvas.height,
                (visibleRect.width / 100) * canvas.width,
                (visibleRect.height / 100) * canvas.height
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
        setCompletedCrop(undefined);
        setRedactions([]);
        setDraftRedaction(null);
        draftStartPointRef.current = null;
        onClose();
    };

    const handleConfirm = async () => {
        const image = imgRef.current;
        const activeCrop = crop;
        if (image && activeCrop) {
            const pixelCrop =
                completedCrop ??
                convertToPixelCrop(activeCrop, image.width, image.height);

            try {
                const croppedBlob = await getCroppedImg(image, pixelCrop, activeCrop, redactions);
                if (croppedBlob) {
                    onCropComplete(croppedBlob);
                }
            } catch (error) {
                console.error(error);
            }
            return;
        }

        if (imageSrc) {
            try {
                const res = await fetch(imageSrc);
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
                        onComplete={(nextCrop) => setCompletedCrop(nextCrop)}
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
                            src={imageSrc}
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
