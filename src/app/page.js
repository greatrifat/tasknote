import Link from "next/link";
import { card } from "@/components/ui";

export default function Home() {
  return (
    <div>
      <h1 className="text-3xl font-semibold tracking-tight">TaskNote</h1>
      <p className="mt-2 opacity-70">Keep your notes and your meetings in one place.</p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Link href="/notes" className={`${card} block transition hover:border-black/30 dark:hover:border-white/30`}>
          <h2 className="text-lg font-medium">Notes</h2>
          <p className="mt-1 text-sm opacity-70">
            Write and tag notes, pin the ones you need close at hand.
          </p>
        </Link>

        <Link href="/meetings" className={`${card} block transition hover:border-black/30 dark:hover:border-white/30`}>
          <h2 className="text-lg font-medium">Meetings</h2>
          <p className="mt-1 text-sm opacity-70">
            Schedule meetings with attendees, location, duration, and notes.
          </p>
        </Link>
      </div>
    </div>
  );
}
