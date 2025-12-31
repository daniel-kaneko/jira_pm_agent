"use client";

import { useState, useEffect, useRef } from "react";

/**
 * Hook that creates a smooth typewriter effect for streamed text.
 * Reveals content character-by-character at a consistent pace.
 * @param content - The full content to reveal.
 * @param charsPerFrame - Characters to reveal per animation frame (default: 3).
 * @param enabled - Whether the effect is active (default: true).
 * @returns The currently displayed portion of the content.
 */
export function useStreamedText(
  content: string,
  charsPerFrame = 2,
  enabled = true
): string {
  const [displayed, setDisplayed] = useState("");
  const targetRef = useRef(content);
  const displayedRef = useRef("");

  useEffect(() => {
    targetRef.current = content;
  }, [content]);

  useEffect(() => {
    if (!enabled) {
      setDisplayed(content);
      displayedRef.current = content;
      return;
    }

    if (displayedRef.current.length >= targetRef.current.length) return;

    let animationId: number;

    const animate = () => {
      const target = targetRef.current;
      const currentLength = displayedRef.current.length;

      if (currentLength < target.length) {
        const nextLength = Math.min(
          currentLength + charsPerFrame,
          target.length
        );
        const nextDisplayed = target.slice(0, nextLength);
        displayedRef.current = nextDisplayed;
        setDisplayed(nextDisplayed);
        animationId = requestAnimationFrame(animate);
      }
    };

    animationId = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(animationId);
  }, [content, charsPerFrame, enabled]);

  useEffect(() => {
    if (content.length < displayedRef.current.length) {
      displayedRef.current = "";
      setDisplayed("");
    }
  }, [content]);

  return enabled ? displayed : content;
}
