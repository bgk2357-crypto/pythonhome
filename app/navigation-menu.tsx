"use client";

import { useId, useState } from "react";

export function NavigationMenu({ label, children }: { label: string; children: string[][] }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return <div className="nav-group" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}
    onFocus={event => { if (event.target.matches(":focus-visible")) setOpen(true); }} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}
    onKeyDown={event => { if (event.key === "Escape") { setOpen(false); event.currentTarget.querySelector("button")?.focus(); } }}>
    <button type="button" className="nav-trigger" aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}>{label}<span aria-hidden="true">⌄</span></button>
    <div id={id} className="dropdown" hidden={!open}>{children.map(([name, href]) => <a href={href} key={href}>{name}</a>)}</div>
  </div>;
}
