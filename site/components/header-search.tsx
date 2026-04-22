"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function HeaderSearch() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = value.trim();
    router.push(trimmed ? `/search?q=${encodeURIComponent(trimmed)}` : "/search");
  };
  return (
    <form aria-label="Site search" className="header-search" onSubmit={submit} role="search">
      <label className="visually-hidden" htmlFor="site-header-search">Search Beaman Woodworks</label>
      <input
        autoComplete="off"
        className="header-search-input"
        id="site-header-search"
        name="q"
        onChange={(event) => setValue(event.target.value)}
        placeholder="Search pieces, process, media"
        type="search"
        value={value}
      />
      <button aria-label="Search" className="header-search-submit" type="submit">
        <svg aria-hidden="true" fill="none" height="16" viewBox="0 0 16 16" width="16" xmlns="http://www.w3.org/2000/svg">
          <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
          <line stroke="currentColor" strokeLinecap="round" strokeWidth="1.5" x1="11" x2="14" y1="11" y2="14" />
        </svg>
      </button>
    </form>
  );
}
