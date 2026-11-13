import Link from "next/link";
import { GiftAudio } from "@/components/gift-audio";
import { notFound } from "next/navigation";
import { publicGift } from "@/lib/growth/gifts";
import { HttpError } from "@/lib/http-error";
export const dynamic = "force-dynamic";
export const metadata = {
  title: { absolute: "A song, just for you | SongGift" },
  description: "A private song gift.",
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};
export default async function GiftPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  let gift: Awaited<ReturnType<typeof publicGift>>;
  try {
    gift = await publicGift(token);
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) notFound();
    return (
      <main className="gift-shell">
        <h1>Your gift is temporarily unavailable.</h1>
        <p>Please try this link again later.</p>
      </main>
    );
  }
  return (
    <main className="gift-shell">
      <Link className="wordmark" href="/">
        ♪ SongGift
      </Link>
      <p className="section-kicker">Someone made this for you</p>
      <div className="gift-record" aria-hidden="true">
        ♪
      </div>
      <h1>{gift.title}</h1>
      <p>For {gift.recipient}, with love.</p>
      {gift.greeting && <blockquote>{gift.greeting}</blockquote>}
      <GiftAudio token={token} title={gift.title} />
      <p className="gift-hint">
        Press play when you are ready. If this gift stops being available, ask
        the sender for a new link.
      </p>
      <Link className="text-link" href="/create">
        Make a song for someone special →
      </Link>
    </main>
  );
}
