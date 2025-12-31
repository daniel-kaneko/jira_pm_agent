"use client";

import { useCallback, useRef } from "react";
import { CanvasEffect } from "../CanvasEffect";
import { themeConfig } from "../config";

interface OceanEffectProps {
  enabled: boolean;
}

interface Bubble {
  x: number;
  y: number;
  radius: number;
  speed: number;
  wobble: number;
  wobbleSpeed: number;
  opacity: number;
}

const config = themeConfig.ocean;

/**
 * Underwater ocean effect with rising bubbles and caustic light patterns.
 */
export function OceanEffect({ enabled }: OceanEffectProps) {
  const bubblesRef = useRef<Bubble[]>([]);

  const onInit = useCallback(
    (_ctx: CanvasRenderingContext2D, width: number, height: number) => {
      bubblesRef.current = Array.from({ length: config.maxBubbles }, () => ({
        x: Math.random() * width,
        y: height + Math.random() * height,
        radius: Math.random() * 4 + 2,
        speed: (Math.random() * 1 + 0.5) * config.speed,
        wobble: Math.random() * Math.PI * 2,
        wobbleSpeed: Math.random() * 0.02 + 0.01,
        opacity: (Math.random() * 0.3 + 0.1) * config.opacity,
      }));
    },
    []
  );

  const onDraw = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      width: number,
      height: number,
      time: number
    ) => {
      ctx.clearRect(0, 0, width, height);

      ctx.globalAlpha = config.causticOpacity;
      for (let waveLayer = 0; waveLayer < 3; waveLayer++) {
        const offset = time * 0.0005 + waveLayer * 2;
        ctx.beginPath();
        for (let xPos = 0; xPos < width; xPos += 20) {
          const yPos = Math.sin(xPos * 0.01 + offset) * 30 + height * 0.3;
          if (xPos === 0) ctx.moveTo(xPos, yPos);
          else ctx.lineTo(xPos, yPos);
        }
        ctx.strokeStyle = `rgba(100, 200, 255, ${0.1 - waveLayer * 0.02})`;
        ctx.lineWidth = 40 + waveLayer * 20;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      for (const bubble of bubblesRef.current) {
        bubble.y -= bubble.speed;
        bubble.wobble += bubble.wobbleSpeed;
        const wobbleX = Math.sin(bubble.wobble) * 2;

        if (bubble.y < -bubble.radius * 2) {
          bubble.y = height + bubble.radius;
          bubble.x = Math.random() * width;
        }

        ctx.beginPath();
        ctx.arc(bubble.x + wobbleX, bubble.y, bubble.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(150, 220, 255, ${bubble.opacity})`;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(
          bubble.x + wobbleX - bubble.radius * 0.3,
          bubble.y - bubble.radius * 0.3,
          bubble.radius * 0.3,
          0,
          Math.PI * 2
        );
        ctx.fillStyle = `rgba(200, 240, 255, ${bubble.opacity * 0.8})`;
        ctx.fill();
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
          "linear-gradient(to bottom, #041526 0%, #082035 50%, #0d3050 100%)",
      }}
      onInit={onInit}
      onDraw={onDraw}
    />
  );
}

