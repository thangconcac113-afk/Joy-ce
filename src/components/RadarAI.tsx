"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "./I18n";

type Message = { role: "assistant" | "user"; text: string };
type SpeechResult = { 0: { transcript: string } };
type SpeechEvent = { results: ArrayLike<SpeechResult> };
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

const starter: Message = {
  role: "assistant",
  text: "Hi, I’m TS Minion. Ask me what is performing, which channel is growing, or what the team should review next.",
};

export function RadarAI() {
  const { t, locale } = useI18n();
  const speechLang = locale === "vi" ? "vi-VN" : "en-US";
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([starter]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [voice, setVoice] = useState(true);
  const endRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);
  useEffect(() => {
    return () => {
      window.speechSynthesis?.cancel();
    };
  }, []);

  function speak(value: string) {
    if (!voice || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(value);
    utterance.lang = speechLang;
    utterance.rate = 1.02;
    window.speechSynthesis.speak(utterance);
  }

  async function ask(value = text) {
    const question = value.trim();
    if (!question || busy) return;
    setMessages((items) => [...items, { role: "user", text: question }]);
    setText("");
    setBusy(true);
    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, range: "30d", lang: locale }),
      });
      const body = await response.json().catch(() => ({}));
      const answer = response.ok ? body.answer : body.error ?? t("I couldn’t read the performance data right now.");
      setMessages((items) => [...items, { role: "assistant", text: answer }]);
      if (response.ok) speak(answer);
    } catch {
      setMessages((items) => [...items, { role: "assistant", text: t("I couldn’t reach the performance data. Please try again.") }]);
    } finally {
      setBusy(false);
    }
  }

  function listen() {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const SpeechRecognition = (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike }).SpeechRecognition
      ?? (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike }).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setMessages((items) => [...items, { role: "assistant", text: t("Voice input is not supported in this browser. You can still type your question.") }]);
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = speechLang;
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      const heard = event.results[0]?.[0]?.transcript ?? "";
      setText(heard);
      void ask(heard);
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }

  return (
    <div className="radar-ai">
      {open && (
        <section className="radar-panel" aria-label={t("TS Minion assistant")}>
          <header className="radar-head">
            <div><span className="radar-orb small" aria-hidden><i /></span><div><b>TS Minion</b><small>{t("Content performance analyst")}</small></div></div>
            <div className="radar-head-actions">
              <button type="button" onClick={() => setVoice((value) => !value)} title={voice ? t("Mute voice") : t("Enable voice")} aria-label={voice ? t("Mute voice") : t("Enable voice")}>{voice ? "🔊" : "🔇"}</button>
              <button type="button" onClick={() => setOpen(false)} aria-label={t("Close TS Minion")}>×</button>
            </div>
          </header>
          <div className="radar-messages" aria-live="polite">
            {messages.map((message, index) => <div className={`radar-message ${message.role}`} key={index}>{message.role === "assistant" ? t(message.text) : message.text}</div>)}
            {busy && <div className="radar-message assistant thinking"><i /><i /><i /></div>}
            {messages.length === 1 && <div className="radar-prompts">
              {["What is our top video?", "Which channel performs best?", "Are our channels growing?"].map((prompt) => <button type="button" key={prompt} onClick={() => void ask(t(prompt))}>{t(prompt)}</button>)}
            </div>}
            <div ref={endRef} />
          </div>
          <form className="radar-compose" onSubmit={(event) => { event.preventDefault(); void ask(); }}>
            <button className={listening ? "radar-mic active" : "radar-mic"} type="button" onClick={listen} aria-label={listening ? t("Stop listening") : t("Ask with voice")}>{listening ? "■" : "●"}</button>
            <input value={text} onChange={(event) => setText(event.target.value)} placeholder={listening ? t("Listening…") : t("Ask about performance…")} maxLength={500} aria-label={t("Message TS Minion")} />
            <button className="radar-send" type="submit" disabled={!text.trim() || busy} aria-label={t("Send message")}>↑</button>
          </form>
          <footer>{t("Uses live metrics from Video Tracker")}</footer>
        </section>
      )}
      <button className="radar-launch" type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-label={open ? t("Close TS Minion") : t("Open TS Minion")}>
        <span className="radar-orb" aria-hidden><i /></span><span><b>{t("Ask TS Minion")}</b><small>{t("Voice + live insights")}</small></span>
      </button>
    </div>
  );
}
