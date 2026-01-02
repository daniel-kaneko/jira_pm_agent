"use client";

import { useState, useEffect } from "react";
import {
  SLEEPING_ROBOT,
  SLEEPING_ROBOT_2,
  CHECKING_FRAMES,
  LOADING_MESSAGES,
  WAKING_FRAMES,
  WAKING_MESSAGES,
  SLEEPING_MESSAGE,
} from "@/lib/constants";
import type {
  RobotStatusType,
  AnimationConfig,
  RobotStatusProps,
} from "./types";

const ANIMATION_CONFIG: Record<
  Exclude<RobotStatusType, "ready">,
  AnimationConfig
> = {
  sleeping: { frameMs: 1500, frameCount: 2 },
  checking: {
    frameMs: 400,
    frameCount: CHECKING_FRAMES.length,
    messageMs: 2000,
    messageCount: LOADING_MESSAGES.length,
  },
  waking: {
    frameMs: 500,
    frameCount: WAKING_FRAMES.length,
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

  const robotFrames = {
    sleeping: frame === 0 ? SLEEPING_ROBOT : SLEEPING_ROBOT_2,
    waking: WAKING_FRAMES[frame % WAKING_FRAMES.length],
    checking: CHECKING_FRAMES[frame % CHECKING_FRAMES.length],
  };

  const messages = {
    sleeping: SLEEPING_MESSAGE,
    waking: WAKING_MESSAGES[messageIndex % WAKING_MESSAGES.length],
    checking: LOADING_MESSAGES[messageIndex % LOADING_MESSAGES.length],
  };

  const robot = robotFrames[status];
  const message = messages[status];

  return (
    <div className="flex flex-col items-center justify-center py-12 animate-fade-in">
      <pre
        className="text-[var(--fg-muted)] text-sm sm:text-base font-mono leading-tight select-none"
        style={{ letterSpacing: "0.02em" }}
      >
        {robot}
      </pre>
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
