import Link from "next/link";
import LeadForm from "./LeadForm";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-white px-6 py-16 text-center">
      {/* Ganti teks di bawah ini sesuai produk/jasa kamu */}
      <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">
        Landing Page
      </p>
      <Link
        href="/cara-kerja"
        className="mt-2 text-sm text-zinc-500 underline decoration-zinc-300 underline-offset-4 hover:text-blue-600"
      >
        Lihat cara kerja di balik layar →
      </Link>
      <h1 className="mt-4 max-w-2xl text-4xl font-bold text-zinc-900 sm:text-5xl">
        Judul Utama Kamu di Sini
      </h1>
      <p className="mt-6 max-w-xl text-lg text-zinc-600">
        Tulis satu-dua kalimat yang menjelaskan apa yang kamu tawarkan dan
        kenapa orang harus tertarik.
      </p>

      <LeadForm />
    </main>
  );
}
