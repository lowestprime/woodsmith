"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function StudioMediaFilter({ defaultQuery }: { defaultQuery: string }) {
  const router = useRouter();
  const [value, setValue] = useState(defaultQuery);
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const params = new URLSearchParams({ panel: "media" });
    const trimmed = value.trim();
    if (trimmed) params.set("media", trimmed);
    params.set("mediaPage", "1");
    router.replace(`/studio?${params.toString()}`, { scroll: false });
    router.refresh();
  };
  return (
    <form className="request-form compact-form" onSubmit={handleSubmit}>
      <label>
        <span>Filter media</span>
        <input name="media" value={value} onChange={(event) => setValue(event.target.value)} type="text" />
      </label>
      <button className="button-secondary" type="submit">Filter</button>
    </form>
  );
}
