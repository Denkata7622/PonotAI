"use client";

import { useLanguage } from "../../lib/LanguageContext";

export default function AboutPage() {
  const { language } = useLanguage();
  const isBg = language === "bg";

  return (
    <section className="card p-6">
      <h1 className="cardTitle text-2xl font-bold">{isBg ? "За ПонотИИ" : "About PonotAI"}</h1>
      <p className="cardText mt-3">
        {isBg
          ? "ПонотИИ ти помага да разпознаваш песни и да запазваш намереното в личната си библиотека."
          : "PonotAI helps you recognize songs and save what you find into your personal library."}
      </p>
    </section>
  );
}
