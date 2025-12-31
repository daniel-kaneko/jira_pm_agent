"use client";

import { useCallback, useRef } from "react";
import { CanvasEffect } from "../CanvasEffect";
import { themeConfig } from "../config";

interface SynthwaveEffectProps {
  enabled: boolean;
}

const config = themeConfig.synthwave;

const STAR_POSITIONS = [
  { x: 0.1, y: 0.1 },
  { x: 0.25, y: 0.2 },
  { x: 0.4, y: 0.08 },
  { x: 0.55, y: 0.15 },
  { x: 0.7, y: 0.05 },
  { x: 0.85, y: 0.18 },
  { x: 0.15, y: 0.35 },
  { x: 0.3, y: 0.45 },
  { x: 0.6, y: 0.4 },
  { x: 0.8, y: 0.3 },
  { x: 0.05, y: 0.5 },
  { x: 0.95, y: 0.55 },
];

/**
 * Synthwave/retrowave effect with neon grid and horizon sun.
 */
export function SynthwaveEffect({ enabled }: SynthwaveEffectProps) {
  const gridOffsetRef = useRef(0);

  const onDraw = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, height: number) => {
      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, "#0a0010");
      gradient.addColorStop(0.4, "#1a0a2e");
      gradient.addColorStop(0.6, "#2d1b4e");
      gradient.addColorStop(0.75, "#1a0a2e");
      gradient.addColorStop(1, "#0a0010");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      const horizonY = height * 0.65;
      ctx.fillStyle = `rgba(255, 255, 255, ${0.4 * config.opacity})`;
      for (const star of STAR_POSITIONS) {
        const y = star.y * horizonY;
        ctx.beginPath();
        ctx.arc(star.x * width, y, 1, 0, Math.PI * 2);
        ctx.fill();
      }

      const sunRadius = Math.min(width, height) * 0.1;
      const sunX = width * 0.5;
      const sunY = horizonY - sunRadius - sunRadius * 0.15;

      const glowGradient = ctx.createRadialGradient(
        sunX,
        sunY,
        sunRadius * 0.5,
        sunX,
        sunY,
        sunRadius * 3
      );
      glowGradient.addColorStop(
        0,
        `rgba(255, 100, 150, ${0.2 * config.opacity})`
      );
      glowGradient.addColorStop(
        0.4,
        `rgba(255, 50, 100, ${0.1 * config.opacity})`
      );
      glowGradient.addColorStop(1, "transparent");
      ctx.fillStyle = glowGradient;
      ctx.fillRect(0, 0, width, height);

      const sunGradient = ctx.createLinearGradient(
        sunX,
        sunY - sunRadius,
        sunX,
        sunY + sunRadius
      );
      sunGradient.addColorStop(
        0,
        `rgba(255, 220, 100, ${0.8 * config.opacity})`
      );
      sunGradient.addColorStop(
        0.5,
        `rgba(255, 120, 80, ${0.7 * config.opacity})`
      );
      sunGradient.addColorStop(
        1,
        `rgba(255, 50, 120, ${0.6 * config.opacity})`
      );

      ctx.beginPath();
      ctx.arc(sunX, sunY, sunRadius, 0, Math.PI * 2);
      ctx.fillStyle = sunGradient;
      ctx.fill();

      ctx.save();
      ctx.beginPath();
      ctx.arc(sunX, sunY, sunRadius, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = "#0a0010";
      for (let stripe = 0; stripe < 5; stripe++) {
        const stripeY = sunY + sunRadius * 0.1 + stripe * sunRadius * 0.22;
        ctx.fillRect(
          sunX - sunRadius,
          stripeY,
          sunRadius * 2,
          sunRadius * 0.08 + stripe * 2
        );
      }
      ctx.restore();

      const gridHeight = height - horizonY;
      const gridStartWidth = Math.min(width, height) * 0.12;
      const sunLeftEdge = sunX - gridStartWidth / 2;
      const sunRightEdge = sunX + gridStartWidth / 2;
      const screenOverflow = width * 0.15;

      const fadeGradient = ctx.createLinearGradient(0, horizonY, 0, height);
      fadeGradient.addColorStop(
        0,
        `rgba(255, 0, 200, ${0.02 * config.opacity})`
      );
      fadeGradient.addColorStop(
        0.3,
        `rgba(255, 0, 200, ${0.15 * config.opacity})`
      );
      fadeGradient.addColorStop(
        1,
        `rgba(100, 0, 255, ${0.25 * config.opacity})`
      );
      ctx.fillStyle = fadeGradient;
      ctx.fillRect(0, horizonY, width, gridHeight);

      ctx.strokeStyle = `rgba(255, 0, 200, ${0.3 * config.opacity})`;
      ctx.lineWidth = 1;

      const verticalLines = 20;
      for (let lineIndex = -verticalLines; lineIndex <= verticalLines; lineIndex++) {
        const normalizedPosition = (lineIndex + verticalLines) / (verticalLines * 2);
        const startX = sunLeftEdge + normalizedPosition * (sunRightEdge - sunLeftEdge);
        const endX = -screenOverflow + normalizedPosition * (width + screenOverflow * 2);

        ctx.beginPath();
        ctx.moveTo(startX, horizonY);
        ctx.lineTo(endX, height);
        ctx.stroke();
      }

      gridOffsetRef.current = (gridOffsetRef.current + config.speed) % 100;

      for (let gridLine = 0; gridLine <= 15; gridLine++) {
        const progress = (gridLine / 15 + gridOffsetRef.current / 100) % 1;
        const perspectiveY = horizonY + Math.pow(progress, 2) * gridHeight;

        if (perspectiveY > horizonY) {
          ctx.strokeStyle = `rgba(0, 255, 255, ${
            Math.pow(progress, 1.5) * 0.3 * config.opacity
          })`;
          ctx.lineWidth = 1 + progress * 1.5;

          ctx.beginPath();
          ctx.moveTo(0, perspectiveY);
          ctx.lineTo(width, perspectiveY);
          ctx.stroke();
        }
      }
    },
    []
  );

  return (
    <CanvasEffect
      enabled={enabled}
      fps={config.fps}
      reducedMotionStyle={{
        background:
          "linear-gradient(to bottom, " +
          "#0a0010 0%, #1a0a2e 40%, #2d1b4e 60%, " +
          "rgba(255, 100, 150, 0.1) 75%, #0a0010 100%)",
      }}
      onDraw={onDraw}
    />
  );
}

