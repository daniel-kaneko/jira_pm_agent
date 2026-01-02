"use client";

import type { RobotStatusType } from "./types";

interface RobotSVGProps {
  status: RobotStatusType;
  frame: number;
  className?: string;
}

type EyeState = "closed" | "open" | "half" | "looking-left" | "looking-right";

interface RobotFrameProps {
  leftEye: EyeState;
  rightEye: EyeState;
  showZzz?: boolean;
  zzzOffset?: number;
  showQuestion?: boolean;
  showExclamation?: boolean;
  antennaWiggle?: number;
}

function Eye({ state, cx, cy }: { state: EyeState; cx: number; cy: number }) {
  const baseRadius = 4;

  switch (state) {
    case "closed":
      return (
        <line
          x1={cx - 4}
          y1={cy}
          x2={cx + 4}
          y2={cy}
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      );
    case "half":
      return (
        <ellipse cx={cx} cy={cy} rx={baseRadius} ry={2} fill="currentColor" />
      );
    case "looking-left":
      return <circle cx={cx - 2} cy={cy} r={baseRadius} fill="currentColor" />;
    case "looking-right":
      return <circle cx={cx + 2} cy={cy} r={baseRadius} fill="currentColor" />;
    case "open":
    default:
      return <circle cx={cx} cy={cy} r={baseRadius} fill="currentColor" />;
  }
}

function RobotFrame({
  leftEye,
  rightEye,
  showZzz = false,
  zzzOffset = 0,
  showQuestion = false,
  showExclamation = false,
  antennaWiggle = 0,
}: RobotFrameProps) {
  return (
    <g>
      {/* Antenna */}
      <line
        x1={50}
        y1={20}
        x2={50 + antennaWiggle}
        y2={8}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx={50 + antennaWiggle} cy={6} r={4} fill="currentColor" />

      {/* Zzz for sleeping */}
      {showZzz && (
        <g className="zzz-group">
          <text
            x={62 + zzzOffset}
            y={8}
            fontSize="10"
            fill="currentColor"
            fontWeight="bold"
            opacity={0.7}
          >
            z
          </text>
          <text
            x={68 + zzzOffset * 0.5}
            y={16}
            fontSize="8"
            fill="currentColor"
            fontWeight="bold"
            opacity={0.5}
          >
            z
          </text>
        </g>
      )}

      {/* Question mark for checking */}
      {showQuestion && (
        <text
          x={62}
          y={14}
          fontSize="14"
          fill="var(--accent, #3b82f6)"
          fontWeight="bold"
        >
          ?
        </text>
      )}

      {/* Exclamation for alert */}
      {showExclamation && (
        <text
          x={64}
          y={14}
          fontSize="14"
          fill="var(--green, #10b981)"
          fontWeight="bold"
        >
          !
        </text>
      )}

      {/* Head */}
      <rect
        x={25}
        y={22}
        width={50}
        height={36}
        rx={6}
        ry={6}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />

      {/* Eyes */}
      <Eye state={leftEye} cx={40} cy={40} />
      <Eye state={rightEye} cx={60} cy={40} />

      {/* Neck connectors */}
      <rect x={35} y={58} width={6} height={8} fill="currentColor" rx={1} />
      <rect x={59} y={58} width={6} height={8} fill="currentColor" rx={1} />

      {/* Body */}
      <rect
        x={30}
        y={66}
        width={40}
        height={16}
        rx={3}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />

      {/* Legs */}
      <rect x={38} y={82} width={4} height={12} fill="currentColor" rx={1} />
      <rect x={58} y={82} width={4} height={12} fill="currentColor" rx={1} />

      {/* Feet */}
      <rect x={32} y={94} width={16} height={4} fill="currentColor" rx={1} />
      <rect x={52} y={94} width={16} height={4} fill="currentColor" rx={1} />
    </g>
  );
}

export function RobotSVG({ status, frame, className }: RobotSVGProps) {
  const getFrameProps = (): RobotFrameProps => {
    switch (status) {
      case "sleeping":
        return {
          leftEye: "closed",
          rightEye: "closed",
          showZzz: true,
          zzzOffset: frame === 0 ? 0 : 4,
          antennaWiggle: frame === 0 ? -2 : 2,
        };

      case "checking":
        if (frame === 0) {
          return {
            leftEye: "open",
            rightEye: "open",
            showQuestion: true,
          };
        } else if (frame === 1) {
          return {
            leftEye: "looking-left",
            rightEye: "looking-left",
            showQuestion: true,
          };
        } else {
          return {
            leftEye: "open",
            rightEye: "open",
            showExclamation: true,
          };
        }

      case "waking":
        return {
          leftEye: frame === 0 ? "half" : "open",
          rightEye: frame === 0 ? "open" : "half",
          antennaWiggle: frame === 0 ? -1 : 1,
        };

      case "ready":
      default:
        return {
          leftEye: "open",
          rightEye: "open",
        };
    }
  };

  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label={`Robot ${status}`}
    >
      <RobotFrame {...getFrameProps()} />
    </svg>
  );
}
