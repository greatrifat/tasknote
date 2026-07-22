import "./globals.css";
import Link from "next/link";

export const metadata = {
  title: "TaskNote",
  description: "Notes and meetings, in one place",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <header className="border-b border-black/10 dark:border-white/10">
          <nav className="mx-auto flex max-w-7xl items-center gap-6 px-6 py-4">
            <Link href="/" className="text-lg font-semibold tracking-tight">
              TaskNote
            </Link>
            <div className="flex gap-4 text-sm">
              <Link href="/links" className="opacity-70 transition hover:opacity-100">
                Links
              </Link>
              <Link href="/notes" className="opacity-70 transition hover:opacity-100">
                Notes
              </Link>
              <Link href="/meetings" className="opacity-70 transition hover:opacity-100">
                Meetings
              </Link>
              <Link href="/ask" className="opacity-70 transition hover:opacity-100">
                Ask
              </Link>
              <Link href="/settings" className="opacity-70 transition hover:opacity-100">
                Settings
              </Link>
            </div>
          </nav>
        </header>
        <main className="mx-auto max-w-7xl px-6 py-10">{children}</main>
      </body>
    </html>
  );
}
