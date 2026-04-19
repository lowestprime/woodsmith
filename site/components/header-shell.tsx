"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

const CONDENSE_SCROLL_Y = 24;
const HIDE_SCROLL_Y = 96;
const DIRECTION_THRESHOLD = 8;

export function HeaderShell({ children }: { children: ReactNode }) {
  const [condensed, setCondensed] = useState(false);
  const [hidden, setHidden] = useState(false);
  const lastScrollYRef = useRef(0);
  const hiddenRef = useRef(false);

  useEffect(() => {
    let frame = 0;

    const update = () => {
      const nextScrollY = Math.max(window.scrollY, 0);
      const delta = nextScrollY - lastScrollYRef.current;
      lastScrollYRef.current = nextScrollY;

      const nextCondensed = nextScrollY > CONDENSE_SCROLL_Y;
      setCondensed((current) => (current === nextCondensed ? current : nextCondensed));

      let nextHidden = hiddenRef.current;
      if (nextScrollY <= CONDENSE_SCROLL_Y || delta <= -DIRECTION_THRESHOLD) {
        nextHidden = false;
      } else if (nextScrollY > HIDE_SCROLL_Y && delta >= DIRECTION_THRESHOLD) {
        nextHidden = true;
      }

      if (hiddenRef.current !== nextHidden) {
        hiddenRef.current = nextHidden;
        setHidden(nextHidden);
      }
    };

    const onScroll = () => {
      if (frame !== 0) {
        return;
      }

      frame = window.requestAnimationFrame(() => {
        frame = 0;
        update();
      });
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

    return () => {
      if (frame !== 0) {
        window.cancelAnimationFrame(frame);
      }
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <div
      className="site-header-shell"
      data-condensed={condensed ? "true" : "false"}
      data-hidden={hidden ? "true" : "false"}
    >
      {children}
    </div>
  );
}
