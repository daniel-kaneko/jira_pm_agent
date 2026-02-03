import { useEffect, useRef } from "react";

/**
 * Custom hook to synchronize horizontal scroll between two elements.
 */
export function useScrollSync() {
  const headerScrollRef = useRef<HTMLDivElement>(null);
  const rowsScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const headerEl = headerScrollRef.current;
    const rowsEl = rowsScrollRef.current;
    if (!headerEl || !rowsEl) return;

    let headerScrolling = false;
    let rowsScrolling = false;

    const handleHeaderScroll = () => {
      if (rowsScrolling) return;
      headerScrolling = true;
      rowsEl.scrollLeft = headerEl.scrollLeft;
      requestAnimationFrame(() => {
        headerScrolling = false;
      });
    };

    const handleRowsScroll = () => {
      if (headerScrolling) return;
      rowsScrolling = true;
      headerEl.scrollLeft = rowsEl.scrollLeft;
      requestAnimationFrame(() => {
        rowsScrolling = false;
      });
    };

    headerEl.addEventListener("scroll", handleHeaderScroll, { passive: true });
    rowsEl.addEventListener("scroll", handleRowsScroll, { passive: true });

    return () => {
      headerEl.removeEventListener("scroll", handleHeaderScroll);
      rowsEl.removeEventListener("scroll", handleRowsScroll);
    };
  }, []);

  return { headerScrollRef, rowsScrollRef };
}
