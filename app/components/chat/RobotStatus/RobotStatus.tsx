"use client";

import { useState, useEffect } from "react";
import {
  LOADING_MESSAGES,
  WAKING_MESSAGES,
  SLEEPING_MESSAGE,
} from "@/lib/constants";
import { RobotSVG } from "./RobotSVG";
import type { RobotStatusType, AnimationConfig, RobotStatusProps } from "./types";

const ANIMATION_CONFIG: Record<
  Exclude<RobotStatusType, "ready">,
  AnimationConfig
> = {
  sleeping: { frameMs: 1500, frameCount: 2 },
  checking: {
    frameMs: 400,
    frameCount: 3,
    messageMs: 2000,
    messageCount: LOADING_MESSAGES.length,
  },
  waking: {
    frameMs: 500,
    frameCount: 2,
    messageMs: 2500,
    messageCount: WAKING_MESSAGES.length,
    showTimer: true,
  },
};

export function RobotStatus({ status }: RobotStatusProps) {
  const [frame, setFrame] = useState(0);
  const [messageIndex, setMessageIndex] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (status === "ready") return;

    const config = ANIMATION_CONFIG[status];
    const intervals: NodeJS.Timeout[] = [];

    if (config.showTimer) setElapsedSeconds(0);

    const frameCount = config.frameCount;
    intervals.push(
      setInterval(
        () => setFrame((prev) => (prev + 1) % frameCount),
        config.frameMs
      )
    );

    if (config.messageMs && config.messageCount) {
      const messageCount = config.messageCount;
      intervals.push(
        setInterval(
          () => setMessageIndex((prev) => (prev + 1) % messageCount),
          config.messageMs
        )
      );
    }

    if (config.showTimer) {
      intervals.push(
        setInterval(() => setElapsedSeconds((prev) => prev + 1), 1000)
      );
    }

    return () => intervals.forEach(clearInterval);
  }, [status]);

  if (status === "ready") return null;

  const config = ANIMATION_CONFIG[status];

  const messages: Record<Exclude<RobotStatusType, "ready">, string> = {
    sleeping: SLEEPING_MESSAGE,
    waking: WAKING_MESSAGES[messageIndex % WAKING_MESSAGES.length],
    checking: LOADING_MESSAGES[messageIndex % LOADING_MESSAGES.length],
  };

  const message = messages[status];

  return (
    <div className="flex flex-col items-center justify-center py-12 animate-fade-in">
      <RobotSVG
        status={status}
        frame={frame}
        className="w-24 h-24 sm:w-32 sm:h-32 text-[var(--fg-muted)] transition-all duration-300"
      />
      <p className="mt-6 text-[var(--fg-dim)] text-sm">{message}</p>
      {status === "sleeping" && (
        <p className="mt-3 text-[var(--accent)] text-sm font-medium animate-pulse text-center">
          Type anything to wake me up!
          <br />~ 2 min
        </p>
      )}
      {config.showTimer && (
        <p className="mt-2 text-[var(--fg-dim)] text-xs font-mono tabular-nums">
          {Math.floor(elapsedSeconds / 60)}:
          {String(elapsedSeconds % 60).padStart(2, "0")}
        </p>
      )}
    </div>
  );
}
