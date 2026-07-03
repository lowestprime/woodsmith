"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

function isTypingTarget(target: EventTarget | null) {
  const element = target as HTMLElement | null;
  if (!element) return false;
  const tag = element.tagName.toLowerCase();
  return element.isContentEditable || tag === "input" || tag === "textarea" || tag === "select";
}

function mediaCards() {
  return Array.from(document.querySelectorAll<HTMLButtonElement>(".studio-media-browser-card"));
}

function setActiveCard(index: number) {
  const cards = mediaCards();
  if (!cards.length) return 0;
  const nextIndex = Math.max(0, Math.min(cards.length - 1, index));
  cards.forEach((card, i) => {
    card.dataset.mediaActive = i === nextIndex ? "true" : "false";
    card.tabIndex = i === nextIndex ? 0 : -1;
  });
  cards[nextIndex]?.click();
  cards[nextIndex]?.scrollIntoView({ block: "center", behavior: "smooth" });
  cards[nextIndex]?.focus({ preventScroll: true });
  return nextIndex;
}

function activeCardIndex() {
  const cards = mediaCards();
  const active = cards.findIndex((card) => card.dataset.mediaActive === "true");
  return active >= 0 ? active : 0;
}

function activeCard() {
  const cards = mediaCards();
  return cards[activeCardIndex()] ?? cards[0] ?? null;
}

function submitFirst(buttonOrForm: HTMLButtonElement | HTMLFormElement | null) {
  if (!buttonOrForm) return false;
  if (buttonOrForm instanceof HTMLButtonElement) {
    buttonOrForm.click();
    return true;
  }
  buttonOrForm.requestSubmit();
  return true;
}

export function StudioMediaHotkeys() {
  const searchParams = useSearchParams();
  const enabled = searchParams.get("panel") === "media";
  const [active, setActive] = useState(0);
  const [notice, setNotice] = useState("J/K move · S save · R reviewed · P piece · U unassign · F filter · ? help");
  const help = useMemo(() => [
    "J / K: next or previous media card",
    "S: save the active media metadata form",
    "R: toggle Reviewed for public use on the active card",
    "P: focus the Piece assignment select on the active card",
    "U: clear the Piece assignment on the active card",
    "F: focus the media filter box",
    "G: return to top of media panel",
    "Shift+G: jump to final visible media card",
    "?: show/hide this help"
  ], []);

  useEffect(() => {
    if (!enabled) return;
    const cards = mediaCards();
    cards.forEach((card, index) => {
      card.tabIndex = index === 0 ? 0 : -1;
      card.dataset.mediaIndex = String(index + 1);
    });
    setActive(setActiveCard(0));
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target)) return;
      const key = event.key.toLowerCase();
      const cards = mediaCards();
      if (!cards.length) return;

      if (key === "j" || key === "arrowdown") {
        event.preventDefault();
        setActive(setActiveCard(activeCardIndex() + 1));
        return;
      }

      if (key === "k" || key === "arrowup") {
        event.preventDefault();
        setActive(setActiveCard(activeCardIndex() - 1));
        return;
      }

      if (key === "g" && event.shiftKey) {
        event.preventDefault();
        setActive(setActiveCard(cards.length - 1));
        return;
      }

      if (key === "g") {
        event.preventDefault();
        setActive(setActiveCard(0));
        return;
      }

      if (key === "f") {
        event.preventDefault();
        const input = document.querySelector<HTMLInputElement>('[data-media-local-filter="true"]')
          ?? document.querySelector<HTMLInputElement>('form input[name="media"]');
        input?.focus();
        input?.select();
        setNotice("Filter focused.");
        return;
      }

      const card = activeCard();
      const inspector = document.querySelector<HTMLElement>(".studio-media-inspector");
      if (!card || !inspector) return;

      if (key === "s") {
        event.preventDefault();
        const saveButton = Array.from(inspector.querySelectorAll<HTMLButtonElement>('button[type="submit"]')).find((button) => /save media/i.test(button.textContent || "")) ?? null;
        if (submitFirst(saveButton)) setNotice("Saving active media metadata...");
        return;
      }

      if (key === "r") {
        event.preventDefault();
        const reviewed = Array.from(inspector.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')).find((input) => input.name === "reviewed");
        if (reviewed) {
          reviewed.checked = !reviewed.checked;
          reviewed.dispatchEvent(new Event("change", { bubbles: true }));
          setNotice(`Reviewed ${reviewed.checked ? "enabled" : "disabled"}. Press S to save.`);
        }
        return;
      }

      if (key === "p") {
        event.preventDefault();
        const pieceSelect = inspector.querySelector<HTMLSelectElement>('select[name="pieceSlug"]');
        pieceSelect?.focus();
        setNotice("Piece selector focused. Choose a piece, then press S after leaving the select.");
        return;
      }

      if (key === "u") {
        event.preventDefault();
        const pieceSelect = inspector.querySelector<HTMLSelectElement>('select[name="pieceSlug"]');
        if (pieceSelect) {
          pieceSelect.value = "";
          pieceSelect.dispatchEvent(new Event("change", { bubbles: true }));
          setNotice("Piece assignment cleared. Press S to save and remove the image from that piece.");
        }
        return;
      }

      if (key === "?") {
        event.preventDefault();
        setNotice((previous) => previous.startsWith("J / K") ? help.join(" · ") : "J / K move · S save · R reviewed · P piece · U unassign · F filter · ? help");
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [enabled, help]);

  if (!enabled) return null;

  return (
    <div className="studio-media-hotkeys" role="status">
      <strong>Media {active + 1}</strong>
      <span>{notice}</span>
    </div>
  );
}
