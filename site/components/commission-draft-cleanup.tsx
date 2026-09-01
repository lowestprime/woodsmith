"use client";

import { useEffect } from "react";

const STORAGE_KEY = "beaman-commission-draft-v2";

export function CommissionDraftCleanup() {
  useEffect(() => {
    window.localStorage.removeItem(STORAGE_KEY);
  }, []);
  return null;
}
