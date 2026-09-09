import { Fraunces, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import Link from "next/link";
import LeadForm from "./LeadForm";
import CursorGlow from "./components/CursorGlow";
import "./home.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["500", "600"],
  style: ["normal", "italic"],
  variable: "--font-display",
});
const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
});
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
});

export default function Home() {
  return (
    <main className={`hm-page ${fraunces.variable} ${plexSans.variable} ${plexMono.variable}`}>
      <CursorGlow />
      <div className="hm-inner">
        <p className="hm-eyebrow">Landing Page</p>
        <Link href="/cara-kerja" className="hm-link">
          Lihat cara kerja di balik layar →
        </Link>
        <h1>
          Judul Utama <em>Kamu</em> di Sini
        </h1>
        <p className="hm-lede">
          Tulis satu-dua kalimat yang menjelaskan apa yang kamu tawarkan dan
          kenapa orang harus tertarik.
        </p>

        <LeadForm />
      </div>
    </main>
  );
}
