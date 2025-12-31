"use client";

import { useCallback, useRef } from "react";
import { CanvasEffect } from "../CanvasEffect";
import { themeConfig } from "../config";

interface SpaceEffectProps {
  enabled: boolean;
}

interface Star {
  x: number;
  y: number;
  z: number;
  prevZ: number;
  size: number;
  brightness: number;
}

const config = themeConfig.space;

/**
 * Immersive space traversal effect with parallax star layers.
 */
export function SpaceEffect({ enabled }: SpaceEffectProps) {
  const starsRef = useRef<Star[]>([]);
  const centerRef = useRef({ x: 0, y: 0 });

  const resetStar = (star: Star, initialZ?: number) => {
    star.x = (Math.random() - 0.5) * config.spread;
    star.y = (Math.random() - 0.5) * config.spread;
    star.z = initialZ ?? config.maxDepth;
    star.prevZ = star.z;
    star.size = Math.random() * 2 + 0.5;
    star.brightness = Math.random() * 0.5 + 0.5;
  };

  const onInit = useCallback(
    (_ctx: CanvasRenderingContext2D, width: number, height: number) => {
      centerRef.current = { x: width / 2, y: height / 2 };
      starsRef.current = Array.from({ length: config.maxStars }, () => {
        const star: Star = { x: 0, y: 0, z: 0, prevZ: 0, size: 0, brightness: 0 };
        resetStar(star, Math.random() * config.maxDepth);
        return star;
      });
    },
    []
  );

  const onResize = useCallback((width: number, height: number) => {
    centerRef.current = { x: width / 2, y: height / 2 };
  }, []);

  const onDraw = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, height: number) => {
      ctx.fillStyle = "rgba(3, 7, 18, 1)";
      ctx.fillRect(0, 0, width, height);

      const gradient1 = ctx.createRadialGradient(
        width * 0.2, height * 0.3, 0,
        width * 0.2, height * 0.3, width * 0.5
      );
      gradient1.addColorStop(0, "rgba(88, 28, 135, 0.04)");
      gradient1.addColorStop(0.5, "rgba(59, 7, 100, 0.02)");
      gradient1.addColorStop(1, "transparent");
      ctx.fillStyle = gradient1;
      ctx.fillRect(0, 0, width, height);

      const gradient2 = ctx.createRadialGradient(
        width * 0.8, height * 0.7, 0,
        width * 0.8, height * 0.7, width * 0.4
      );
      gradient2.addColorStop(0, "rgba(30, 58, 138, 0.03)");
      gradient2.addColorStop(0.5, "rgba(23, 37, 84, 0.015)");
      gradient2.addColorStop(1, "transparent");
      ctx.fillStyle = gradient2;
      ctx.fillRect(0, 0, width, height);

      const { x: centerX, y: centerY } = centerRef.current;

      for (const star of starsRef.current) {
        star.prevZ = star.z;
        star.z -= config.speed;

        if (star.z <= 1) {
          resetStar(star);
          continue;
        }

        const perspectiveScale = 200;
        const screenX = (star.x / star.z) * perspectiveScale + centerX;
        const screenY = (star.y / star.z) * perspectiveScale + centerY;
        const prevScreenX = (star.x / star.prevZ) * perspectiveScale + centerX;
        const prevScreenY = (star.y / star.prevZ) * perspectiveScale + centerY;

        const depth = 1 - star.z / config.maxDepth;
        const radius = Math.max(0.5, star.size * depth * 3);

        const fadeIn = Math.min(1, (config.maxDepth - star.z) / 200);
        const fadeOut = Math.min(1, star.z / 100);
        const alpha = depth * star.brightness * fadeIn * fadeOut * config.opacity;

        if (alpha <= 0.01) continue;

        const hue = Math.round(200 + depth * 60);
        const saturation = Math.round(15 + depth * 40);
        const lightness = Math.round(60 + depth * 35);

        ctx.beginPath();
        ctx.moveTo(prevScreenX, prevScreenY);
        ctx.lineTo(screenX, screenY);
        ctx.strokeStyle = `hsla(${hue}, ${saturation}%, ${lightness}%, ${(alpha * 0.4).toFixed(2)})`;
        ctx.lineWidth = radius;
        ctx.lineCap = "round";
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(screenX, screenY, radius * 0.8, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${hue}, ${saturation}%, ${lightness}%, ${alpha.toFixed(2)})`;
        ctx.fill();

        if (depth > 0.7) {
          ctx.beginPath();
          ctx.arc(screenX, screenY, radius * 2, 0, Math.PI * 2);
          ctx.fillStyle = `hsla(${hue}, ${saturation}%, ${lightness}%, ${(alpha * 0.08).toFixed(2)})`;
          ctx.fill();
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
          "radial-gradient(ellipse at 20% 30%, rgba(88, 28, 135, 0.08) 0%, transparent 50%), " +
          "radial-gradient(ellipse at 80% 70%, rgba(30, 58, 138, 0.06) 0%, transparent 40%), " +
          "rgb(3, 7, 18)",
      }}
      onInit={onInit}
      onDraw={onDraw}
      onResize={onResize}
    />
  );
}

