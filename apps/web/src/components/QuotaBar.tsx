import { useEffect, useRef, useState } from "react";
import type { QuotaInfo } from "@chatconstituicao/shared";

const TOTAL_SEGMENTS = 10;

type QuotaBarProps = {
  quota: QuotaInfo | null;
  onClick: () => void;
};

export function QuotaBar({ quota, onClick }: QuotaBarProps) {
  const [blinkIndex, setBlinkIndex] = useState<number | null>(null);
  const [blinkAll, setBlinkAll] = useState(false);
  const prevUsed = useRef(quota?.questionsUsed ?? 0);

  useEffect(() => {
    if (!quota) return;
    const used = quota.questionsUsed;
    if (used > prevUsed.current) {
      const remaining = Math.max(0, quota.questionsLimit - used);

      if (remaining === 0) {
        // All used up — blink everything
        setBlinkAll(true);
        const timer = setTimeout(() => setBlinkAll(false), 900);
        prevUsed.current = used;
        return () => clearTimeout(timer);
      }

      setBlinkIndex(remaining);
      const timer = setTimeout(() => setBlinkIndex(null), 900);
      prevUsed.current = used;
      return () => clearTimeout(timer);
    }
    prevUsed.current = used;
  }, [quota]);

  if (!quota) return null;

  const remaining = Math.max(0, quota.questionsLimit - quota.questionsUsed);
  const used = quota.questionsUsed;

  return (
    <button
      onClick={onClick}
      className="flex items-end gap-[3px] cursor-pointer group w-full md:justify-end"
      title={`${remaining} perguntas disponíveis`}
    >
      {Array.from({ length: TOTAL_SEGMENTS }, (_, i) => {
        const isAvailable = i < remaining;
        const isUsed = i >= remaining && i < remaining + used;
        const isLocked = i >= quota.questionsLimit;
        const isBlink = i === blinkIndex || (blinkAll && isUsed);

        return (
          <span
            key={i}
            className={[
              "flex-1 md:w-[16px] md:flex-none min-h-[32px] rounded-[1px] transition-colors",
              isAvailable && "bg-ink/100 group-hover:bg-ink/85",
              isUsed && !isBlink && "border border-ink/80",
              isBlink && "quota-blink border border-ink/80",
              isLocked && "bg-ink/5",
            ]
              .filter(Boolean)
              .join(" ")}
          />
        );
      })}
    </button>
  );
}
