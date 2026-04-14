'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ImageViewerProps {
  src: string;
  alt?: string;
  className?: string;
  minZoom?: number;
  maxZoom?: number;
  zoomStep?: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_MIN_ZOOM = 0.25;
const DEFAULT_MAX_ZOOM = 5;
const DEFAULT_ZOOM_STEP = 0.25;
const WHEEL_ZOOM_FACTOR = 0.001;

// ─── Component ───────────────────────────────────────────────────────────────

export function ImageViewer({
  src,
  alt = 'Image',
  className,
  minZoom = DEFAULT_MIN_ZOOM,
  maxZoom = DEFAULT_MAX_ZOOM,
  zoomStep = DEFAULT_ZOOM_STEP,
}: ImageViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Use dynamic state for the image src so it can be replaced
  const [currentSrc, setCurrentSrc] = useState(src);

  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  const clampZoom = useCallback(
    (z: number) => Math.min(maxZoom, Math.max(minZoom, z)),
    [minZoom, maxZoom],
  );

  const handleZoomIn = useCallback(
    () => setZoom((z) => clampZoom(z + zoomStep)),
    [clampZoom, zoomStep],
  );

  const handleZoomOut = useCallback(
    () => setZoom((z) => clampZoom(z - zoomStep)),
    [clampZoom, zoomStep],
  );

  const handleRotateCW = useCallback(() => setRotation((r) => (r + 90) % 360), []);
  const handleRotateCCW = useCallback(() => setRotation((r) => (r - 90 + 360) % 360), []);

  const handleReset = useCallback(() => {
    setZoom(1);
    setRotation(0);
    setPan({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setZoom((z) => clampZoom(z - e.deltaY * WHEEL_ZOOM_FACTOR));
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [clampZoom]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      setIsPanning(true);
      panStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [pan],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isPanning) return;
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      setPan({ x: panStart.current.panX + dx, y: panStart.current.panY + dy });
    },
    [isPanning],
  );

  const handlePointerUp = useCallback(() => setIsPanning(false), []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case '+':
        case '=':
          e.preventDefault();
          handleZoomIn();
          break;
        case '-':
          e.preventDefault();
          handleZoomOut();
          break;
        case 'r':
          e.preventDefault();
          handleRotateCW();
          break;
        case 'R':
          e.preventDefault();
          handleRotateCCW();
          break;
        case '0':
          e.preventDefault();
          handleReset();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          setPan((p) => ({ ...p, x: p.x + 40 }));
          break;
        case 'ArrowRight':
          e.preventDefault();
          setPan((p) => ({ ...p, x: p.x - 40 }));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setPan((p) => ({ ...p, y: p.y + 40 }));
          break;
        case 'ArrowDown':
          e.preventDefault();
          setPan((p) => ({ ...p, y: p.y - 40 }));
          break;
      }
    },
    [handleZoomIn, handleZoomOut, handleRotateCW, handleRotateCCW, handleReset],
  );

  const zoomPercent = Math.round(zoom * 100);

  return (
    <div className={cn('flex flex-col rounded-xl border bg-muted/30 overflow-hidden', className)}>
      {/* ── Toolbar ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b bg-card px-2 py-1.5">
        <div className="flex items-center gap-1">
          {/* Zoom out */}
          <ToolbarButton
            onClick={handleZoomOut}
            disabled={zoom <= minZoom}
            title="Diminuir zoom (−)"
            icon={<path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16zM8 11h6" />}
          />

          {/* Zoom label */}
          <span className="min-w-[3.2rem] text-center text-xs font-medium text-muted-foreground tabular-nums select-none">
            {zoomPercent}%
          </span>

          {/* Zoom in */}
          <ToolbarButton
            onClick={handleZoomIn}
            disabled={zoom >= maxZoom}
            title="Aumentar zoom (+)"
            icon={<path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16zM11 8v6M8 11h6" />}
          />

          <div className="mx-1 h-4 w-px bg-border" />

          {/* Rotate CCW */}
          <ToolbarButton
            onClick={handleRotateCCW}
            title="Girar esquerda (Shift+R)"
            icon={<path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />}
          />

          {/* Rotate CW */}
          <ToolbarButton
            onClick={handleRotateCW}
            title="Girar direita (R)"
            icon={<path strokeLinecap="round" strokeLinejoin="round" d="M15 15l6-6m0 0l-6-6m6 6H9a6 6 0 000 12h3" />}
          />

          {/* Change Doc button */}
          <ToolbarButton
            onClick={() => {
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = 'image/*';
              input.onchange = (e: Event) => {
                const file = (e.target as HTMLInputElement).files?.[0];
                if (file) {
                  setCurrentSrc((prev) => {
                    if (prev.startsWith('blob:')) URL.revokeObjectURL(prev);
                    return URL.createObjectURL(file);
                  });
                }
              };
              input.click();
            }}
            title="Change Doc"
            icon={<path strokeLinecap="round" strokeLinejoin="round" d="M4 4h16v16H4V4zM4 4l16 16" />}
          />
        </div>

        {/* Reset */}
        <ToolbarButton
          onClick={handleReset}
          title="Resetar visualização (0)"
          icon={<path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.992 0 3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />}
        />
      </div>

      {/* ── Image canvas ────────────────────────────────────────── */}
      <div
        ref={containerRef}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className={cn(
          'relative flex items-center justify-center overflow-hidden outline-none',
          'h-[340px]',
          isPanning ? 'cursor-grabbing' : 'cursor-grab',
        )}
        style={{ touchAction: 'none' }}
      >
        <img
          src={currentSrc}
          alt={alt}
          draggable={false}
          className="pointer-events-none select-none max-h-full max-w-full"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom}) rotate(${rotation}deg)`,
            transformOrigin: 'center center',
            transition: isPanning ? 'none' : 'transform 0.15s ease-out',
          }}
        />
      </div>
    </div>
  );
}

// ─── Toolbar Button ──────────────────────────────────────────────────────────

function ToolbarButton({
  onClick,
  disabled,
  title,
  icon,
}: {
  onClick: () => void;
  disabled?: boolean;
  title: string;
  icon: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="h-7 w-7 text-muted-foreground hover:text-foreground"
    >
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor" className="h-4 w-4">
        {icon}
      </svg>
    </Button>
  );
}