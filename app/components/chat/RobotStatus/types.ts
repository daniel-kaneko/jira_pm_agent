import type { AIStatus } from "@/lib/utils/vm-client";

/**
 * Robot display status - extends AIStatus for future UI-specific states.
 * Currently matches AIStatus, but can add states like "error" if needed.
 */
export type RobotStatusType = AIStatus;

export interface AnimationConfig {
  frameMs: number;
  frameCount: number;
  messageMs?: number;
  messageCount?: number;
  showTimer?: boolean;
}

export interface RobotStatusProps {
  status: RobotStatusType;
}

