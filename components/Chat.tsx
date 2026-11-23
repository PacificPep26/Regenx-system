"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { fetchMessages, sendMessage, type ChatMessage } from "@/app/actions/chat";

const POLL_MS = 4000;

export function Chat({ storeId, slug, orderId, orderNumber }: { storeId: string; slug: string; orderId?: string; orderNumber?: number }) {
  const [msgs, setMsgs] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [tagOrder, setTagOrder] = useState(!!orderId);
  const [err, setErr] = useState<string>();
  const [pending, start] = useTransition();
  const bottom = useRef<HTMLDivElement>(null);
  const last = useRef<string | undefined>(undefined);

  const pull = async () => {
    const fresh = await fetchMessages(storeId, last.current);
    if (fresh.length) {
      last.current = fresh[fresh.length - 1].at;
      setMsgs((m) => {
        const seen = new Set(m.map((x) => x.id));
        return [...m, ...fresh.filter((x) => !seen.has(x.id))];
      });
    }
  };

  useEffect(() => {
    pull();
    const t = setInterval(() => document.visibilityState === "visible" && pull(), POLL_MS);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [msgs.length]);

  const send = () => {
    const body = text.trim();
    if (!body) return;
    setErr(undefined);
    start(async () => {
      try {
        await sendMessage(storeId, body, tagOrder ? orderId : undefined);
        setText("");
        await pull();
      } catch {
        setErr("Message not sent. Try again.");
      }
    });
  };

  return (
    <div className="flex h-[calc(100dvh-15rem)] min-h-80 flex-col border border-line md:h-[calc(100dvh-17rem)]">
      <div className="flex-1 space-y-2 overflow-y-auto bg-soft p-3">
        {msgs.length === 0 && <p className="text-center text-sm text-gray-500">No messages yet.</p>}
        {msgs.map((m) => (
          <div key={m.id} className={`flex ${m.mine ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] border px-3 py-2 text-sm md:max-w-[70%] ${m.mine ? "border-navy bg-navy text-white" : m.side === "store" ? "border-line bg-white" : "border-red bg-white"}`}>
              <div className={`mb-0.5 text-[11px] ${m.mine ? "text-white/70" : "text-gray-500"}`}>
                {m.author}{m.side === "admin" ? " · RegenX" : m.side === "gp" ? " · GP" : ""} · {new Date(m.at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
              </div>
              {m.orderId && (
                <Link href={`/s/${slug}/orders/${m.orderId}`} className={`mb-1 inline-block border px-1 text-[11px] ${m.mine ? "border-white/50" : "border-navy text-navy"}`}>
                  Order #{m.orderNumber}
                </Link>
              )}
              <div className="whitespace-pre-wrap break-words">{m.body}</div>
            </div>
          </div>
        ))}
        <div ref={bottom} />
      </div>
      <div className="border-t border-line bg-white p-2">
        {orderId && (
          <label className="mb-1 flex items-center gap-2 text-xs">
            <input type="checkbox" checked={tagOrder} onChange={(e) => setTagOrder(e.target.checked)} /> About order #{orderNumber}
          </label>
        )}
        {err && <p className="mb-1 text-xs text-red">{err}</p>}
        <div className="flex gap-2">
          <textarea
            rows={1}
            className="input h-auto min-h-10 flex-1 resize-none py-2"
            placeholder="Type a message…"
            value={text}
            maxLength={4000}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          <button className="btn-primary" disabled={pending || !text.trim()} onClick={send}>Send</button>
        </div>
      </div>
    </div>
  );
}
