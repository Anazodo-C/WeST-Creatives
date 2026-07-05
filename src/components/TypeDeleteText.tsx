"use client";

import { useEffect, useState } from "react";

export default function TypeDeleteText({
  phrases,
  typeSpeed = 45,
  deleteSpeed = 25,
  pause = 1400,
  className,
}: {
  phrases: string[];
  typeSpeed?: number;
  deleteSpeed?: number;
  pause?: number;
  className?: string;
}) {
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [text, setText] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const current = phrases[phraseIndex % phrases.length];
    let timeout: ReturnType<typeof setTimeout>;

    if (!deleting && text.length < current.length) {
      timeout = setTimeout(() => setText(current.slice(0, text.length + 1)), typeSpeed);
    } else if (!deleting && text.length === current.length) {
      timeout = setTimeout(() => setDeleting(true), pause);
    } else if (deleting && text.length > 0) {
      timeout = setTimeout(() => setText(current.slice(0, text.length - 1)), deleteSpeed);
    } else if (deleting && text.length === 0) {
      setDeleting(false);
      setPhraseIndex((i) => i + 1);
    }

    return () => clearTimeout(timeout);
  }, [text, deleting, phraseIndex, phrases, typeSpeed, deleteSpeed, pause]);

  return (
    <span className={className}>
      {text}
      <span className="caret">|</span>
    </span>
  );
}
