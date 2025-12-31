"use client";

import { useCallback, useRef } from "react";
import { CanvasEffect } from "../CanvasEffect";
import { themeConfig } from "../config";

interface MatrixRainProps {
  enabled: boolean;
}

const config = themeConfig.matrix;

/**
 * Matrix-style falling binary rain effect.
 */
export function MatrixRain({ enabled }: MatrixRainProps) {
  const dropsRef = useRef<number[]>([]);

  const onInit = useCallback(
    (_ctx: CanvasRenderingContext2D, width: number) => {
      const columns = Math.floor(width / config.fontSize);
      dropsRef.current = Array(columns).fill(1);
    },
    []
  );

  const onDraw = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, height: number) => {
      ctx.fillStyle = "rgba(0, 0, 0, 0.05)";
      ctx.fillRect(0, 0, width, height);

      ctx.fillStyle = config.color;
      ctx.font = `${config.fontSize}px monospace`;

      const drops = dropsRef.current;
      for (let column = 0; column < drops.length; column++) {
        const char = config.chars[Math.floor(Math.random() * config.chars.length)];
        const xPos = column * config.fontSize;
        const yPos = drops[column] * config.fontSize;

        ctx.globalAlpha = 0.3 + Math.random() * 0.4;
        ctx.fillText(char, xPos, yPos);

        if (yPos > height && Math.random() > 0.975) {
          drops[column] = 0;
        }
        drops[column] += config.speed;
      }
    },
    []
  );

  const onResize = useCallback((width: number) => {
    const columns = Math.floor(width / config.fontSize);
    dropsRef.current = Array(columns).fill(1);
  }, []);

  return (
    <CanvasEffect
      enabled={enabled}
      fps={config.fps}
      canvasStyle={{ opacity: config.opacity }}
      reducedMotionStyle={{
        background:
          "repeating-linear-gradient(0deg, " +
          "transparent, transparent 14px, " +
          "rgba(0, 255, 65, 0.03) 14px, rgba(0, 255, 65, 0.03) 15px)",
        opacity: config.opacity,
      }}
      onInit={onInit}
      onDraw={onDraw}
      onResize={onResize}
    />
  );
}

