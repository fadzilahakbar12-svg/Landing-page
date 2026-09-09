import { Fraunces, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import Link from "next/link";
import CursorGlow from "../components/CursorGlow";
import "./styles.css";

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

export const metadata = {
  title: "Cara Kerja",
  description: "Alur kerja BarScraper, Bank Data, dan follow-up WhatsApp otomatis -- dijelaskan tanpa istilah teknis.",
};

export default function CaraKerjaPage() {
  return (
    <main className={`wf-flyer ${fraunces.variable} ${plexSans.variable} ${plexMono.variable}`}>
      <CursorGlow />
      <div className="wf-flyer-inner">
        <Link href="/" className="wf-back">
          ← Kembali
        </Link>

        <header className="wf-hero">
          <p className="wf-eyebrow">Cara kerja · bukan sihir</p>
          <h1>
            Dari Loker ke <em>WhatsApp</em>
          </h1>
          <p className="wf-lede">
            Begini perjalanan satu lowongan kerja yang di-scrape, sampai jadi
            pesan WhatsApp yang otomatis nyampe ke HP calon klien —
            dijelaskan tanpa istilah teknis yang bikin pusing.
          </p>
          <ul className="wf-recap">
            <li>1 klik scrape</li>
            <li>3 kolom data terkirim</li>
            <li>2× kirim pesan sehari</li>
            <li>1 dashboard buat pantau semua</li>
          </ul>
        </header>

        <ol className="wf-pipeline">
          <li className="wf-stop">
            <div className="wf-stop-spine">
              <div className="wf-stop-marker" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <rect x="3" y="4" width="13" height="9" rx="1.5" />
                  <line x1="6" y1="7.5" x2="12" y2="7.5" />
                  <line x1="6" y1="10" x2="10" y2="10" />
                  <circle cx="17" cy="16" r="4" />
                  <line x1="20" y1="19" x2="22.5" y2="21.5" />
                </svg>
              </div>
              <div className="wf-stop-connector" aria-hidden="true" />
            </div>
            <div className="wf-stop-card">
              <span className="wf-stop-num">01</span>
              <h2>Anda scrape manual</h2>
              <p>
                Buka halaman lowongan kerja di browser, klik tombol di
                ekstensi BarScraper. Dalam hitungan detik, nama perusahaan,
                nomor WhatsApp, dan email HR-nya otomatis terbaca dari
                halaman itu — tanpa Anda ketik satu per satu.
              </p>
              <p className="wf-tech">ekstensi Chrome · Anda yang pegang kendali kapan scrape jalan</p>
            </div>
          </li>

          <li className="wf-stop">
            <div className="wf-stop-spine">
              <div className="wf-stop-marker" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M12 3v12" />
                  <path d="M7 8l5-5 5 5" />
                  <rect x="3" y="16" width="18" height="5" rx="1.5" />
                </svg>
              </div>
              <div className="wf-stop-connector" aria-hidden="true" />
            </div>
            <div className="wf-stop-card">
              <span className="wf-stop-num">02</span>
              <h2>Klik &quot;Send BD&quot;</h2>
              <p>
                Dari semua data hasil scrape, cuma 3 yang dikirim: nama
                perusahaan, WhatsApp, email. Sisanya (link lowongan,
                deskripsi, dll) tetap di komputer Anda saja. Sekali klik,
                prosesnya jalan sendiri di belakang layar — walau Anda
                pindah tab atau tutup extension-nya.
              </p>
              <p className="wf-tech">kirim ke /api/lead · jalan di background, tahan pindah tab</p>
            </div>
          </li>

          <li className="wf-stop">
            <div className="wf-stop-spine">
              <div className="wf-stop-marker" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <rect x="3" y="4" width="18" height="16" rx="1.5" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                  <line x1="9" y1="4" x2="9" y2="20" />
                  <line x1="15" y1="4" x2="15" y2="20" />
                  <line x1="3" y1="15" x2="21" y2="15" />
                </svg>
              </div>
              <div className="wf-stop-connector" aria-hidden="true" />
            </div>
            <div className="wf-stop-card">
              <span className="wf-stop-num">03</span>
              <h2>Masuk ke Bank Data</h2>
              <p>
                Semua leads ngumpul di satu spreadsheet pusat — &quot;Bank
                Data&quot; Anda. Tiap baris ditandai asalnya: dari scraper,
                atau dari orang yang isi form di website Anda sendiri. Jadi
                datanya tidak tercampur aduk begitu saja.
              </p>
              <p className="wf-tech">Google Sheet · ditandai kolom &quot;source&quot;</p>
            </div>
          </li>

          <li className="wf-stop">
            <div className="wf-stop-spine">
              <div className="wf-stop-marker" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v5l3.2 2" />
                  <circle cx="12" cy="7" r="0.9" fill="currentColor" stroke="none" />
                </svg>
              </div>
              <div className="wf-stop-connector" aria-hidden="true" />
            </div>
            <div className="wf-stop-card">
              <span className="wf-stop-num">04</span>
              <h2>Bangun sendiri, 2× sehari</h2>
              <p>
                Setiap jam 10.30 dan 13.30 WIB, ada program kecil yang
                otomatis &quot;bangun&quot;, membuka Bank Data, dan bertanya:
                siapa saja yang belum pernah disapa? Diambil maksimal 25 nama
                sekali jalan — biar tidak kalap kirim ratusan pesan
                sekaligus.
              </p>
              <p className="wf-tech">cron terjadwal · maks 25 leads per panggilan</p>
            </div>
          </li>

          <li className="wf-stop">
            <div className="wf-stop-spine">
              <div className="wf-stop-marker" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M4 5h16v11H9l-4 4v-4H4z" />
                  <path d="M8 10.5l2.2 2.2L16 8" />
                </svg>
              </div>
              <div className="wf-stop-connector" aria-hidden="true" />
            </div>
            <div className="wf-stop-card">
              <span className="wf-stop-num">05</span>
              <h2>Cek dulu, baru kirim</h2>
              <p>
                Sebelum kirim, sistem cek dulu ke Fonnte (layanan pengirim
                WhatsApp): nomor ini beneran aktif WhatsApp, atau cuma angka
                acak hasil scrape yang salah? Kalau valid, pesan personal —
                bukan template kaku — langsung terkirim ke HP mereka.
              </p>
              <p className="wf-tech">validasi nomor dulu → baru kirim pesan</p>
            </div>
          </li>

          <li className="wf-stop">
            <div className="wf-stop-spine">
              <div className="wf-stop-marker" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M4 5h16v11H9l-4 4v-4H4z" />
                  <path d="M7.5 10.5l1.8 1.8L13 8.5" />
                  <path d="M11.5 10.5l1.8 1.8L17 8.5" />
                </svg>
              </div>
              <div className="wf-stop-connector" aria-hidden="true" />
            </div>
            <div className="wf-stop-card">
              <span className="wf-stop-num">06</span>
              <h2>Pantau tanpa perlu nanya</h2>
              <p>
                Begitu pesan dibaca atau dibalas, statusnya otomatis berubah
                di spreadsheet: Terkirim → Dibaca → Terhubung. Anda tidak
                perlu buka WhatsApp satu-satu untuk tahu siapa yang
                merespons.
              </p>
              <p className="wf-tech">webhook Fonnte · status ter-update real-time</p>
            </div>
          </li>

          <li className="wf-stop">
            <div className="wf-stop-spine">
              <div className="wf-stop-marker" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <line x1="3" y1="21" x2="21" y2="21" />
                  <rect x="5" y="13" width="3.4" height="8" />
                  <rect x="10.3" y="8" width="3.4" height="13" />
                  <rect x="15.6" y="4" width="3.4" height="17" />
                </svg>
              </div>
            </div>
            <div className="wf-stop-card">
              <span className="wf-stop-num">07</span>
              <h2>Satu layar, semua angka</h2>
              <p>
                Buka satu halaman dashboard: dari sekian leads yang
                dihubungi, berapa persen yang membaca, berapa yang membalas?
                Anda bisa lihat progresnya tanpa perlu buka-buka spreadsheet.
              </p>
              <p className="wf-tech">/dashboard · dihitung langsung dari data terbaru</p>
            </div>
          </li>
        </ol>

        <footer className="wf-closing">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 2v4" />
            <path d="M12 18v4" />
            <path d="M4.9 4.9l2.8 2.8" />
            <path d="M16.3 16.3l2.8 2.8" />
            <path d="M2 12h4" />
            <path d="M18 12h4" />
            <path d="M4.9 19.1l2.8-2.8" />
            <path d="M16.3 7.7l2.8-2.8" />
          </svg>
          <p>
            Tidak ada <strong>&quot;AI yang mikir sendiri&quot;</strong> di
            sini — cuma 7 langkah sederhana yang saling lempar tongkat
            estafet, masing-masing cuma ngerjain satu tugas kecil dengan
            rapi.
          </p>
        </footer>
      </div>
    </main>
  );
}
