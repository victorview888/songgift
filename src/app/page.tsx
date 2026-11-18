import { ArrowIcon } from "@/components/arrow-icon";
import Link from "next/link";
import { HomeMenu } from "@/components/home-menu";
import { SongSamples } from "@/components/song-samples";
import { publicSongSamples } from "@/lib/song-samples";
import { HolidaySongs } from "@/components/holiday-songs";
import { holidayOccasions } from "@/lib/holidays";
import { audioPreviewEnabled } from "@/lib/preview-policy";
import { SongPrice } from "@/components/song-price";
import { publicSongPriceUsd } from "@/lib/pricing";
import { Brand } from "@/components/brand";
import { GiftingImage } from "@/components/gifting-image";
import { sceneForOccasion } from "@/lib/gifting-imagery";

export const dynamic = "force-dynamic";
import { AccountNav } from "@/components/account-nav";
import { publicPageMetadata, websiteStructuredData } from "@/lib/seo";
import { JsonLd } from "@/components/json-ld";

export const metadata = publicPageMetadata(
  "Personalized Song Gifts from Your Story | songforalways",
  "Create a personalized AI song gift for birthdays, weddings or anniversaries. Preview and edit lyrics for free, then pay once for your song and audio download.",
  "/",
);

const steps = [
  ["01", "Tell us the story", "Share the names, memories, and details that make this person special."],
  ["02", "Shape the feeling", "Choose a mood and music direction, then review the lyrics."],
  ["03", "Press play", "Receive an original song made around the story only you could tell."],
];

const occasions = [
  ["Birthday", "A surprise they will remember long after the candles are gone.", "/occasions/birthday"],
  ["Wedding", "The little moments that made your love story yours.", "/occasions/wedding"],
  ["Anniversary", "Celebrate the years, places, and memories you share.", "/occasions/anniversary"],
  ["Family", "A song for a parent, child, grandparent, or chosen family.", "/occasions/family"],
  ["Pet", "A joyful tribute for the companion always by your side.", "/occasions/pet"],
  ["In memory", "Keep a meaningful story close with a song full of heart.", "/occasions/memorial"],
];

const faqs = [
  ["What do I need to create a song?", "Just a few personal details and a story. The small moments often make the most meaningful lyrics."],
  ["Can I review the lyrics first?", "Yes. You can read and refine the lyrics before moving on to the finished song."],
  ["What occasions work best?", "Birthdays, weddings, anniversaries, family celebrations, pet tributes, and remembrance are all good starting points."],
  ["Can I choose the mood?", "Yes. Choose from warm, joyful, romantic, nostalgic or uplifting directions, and describe the feeling you want in your story."],
];

export default async function Home() {
  const samples = await publicSongSamples();
  const hasPreview = audioPreviewEnabled();
  return (
    <main>
      <JsonLd data={websiteStructuredData()} />
      <header className="site-header home-header">
        <Link className="brand-link" href="/" aria-label="songforalways home"><Brand /></Link>
        <nav className="desktop-nav" aria-label="Main navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#occasions">Occasions</a>
          <Link href="/pricing">Pricing</Link>
          <a href="#faq">FAQ</a>
        </nav>
        <div className="header-actions"><HomeMenu /><AccountNav /><Link className="header-cta" href="/create">Create a song <ArrowIcon /></Link></div>
      </header>

      <section className="gift-hero">
        <GiftingImage scene="anniversary" sizes="(max-width: 600px) 1100px, 100vw" priority />
        <div className="gift-hero-copy">
          <p className="eyebrow"><span className="eyebrow-dot" />Personalized song gifts, made from your memories</p>
          <h1>Your story.<br />Their favorite song.</h1>
          <p className="gift-hero-description">
            Turn the names, memories and little moments only you know into a personal AI song. {hasPreview ? "Read your lyrics, try one free audio preview, then unlock the full song." : "Read your lyrics for free, then bring them to life."}
          </p>
          <div className="gift-hero-actions">
            <Link className="primary-button" href="/create">Create their song <ArrowIcon /></Link>
            <a className="gift-hero-secondary" href={samples.length ? "#samples" : "#how-it-works"}>{samples.length ? "Hear a sample" : "See how it works"} <span aria-hidden="true">↓</span></a>
          </div>
          <p className="gift-hero-note"><span aria-hidden="true">✦</span> {hasPreview ? "One free 60-second preview per verified account" : "Free lyric preview"} · US${publicSongPriceUsd()} per song · USD / PayPal</p>
        </div>
        <p className="gift-hero-credit">Illustrative AI scene</p>
      </section>

      <div className="trust-strip">
        <span>Made for the moments words cannot quite hold</span>
        <div><strong>Personal</strong><strong>Original</strong><strong>Made to keep</strong></div>
      </div>

      {samples.length > 0 && <SongSamples samples={samples} />}

      <HolidaySongs />

      <section className="section" id="how-it-works">
        <div className="section-heading gift-centered-heading">
          <div><p className="section-kicker">The simple part</p><h2>A little story. A lasting gift.</h2></div>
          <p>No songwriting experience needed. Just bring the story that means something to you.</p>
        </div>
        <div className="step-grid">
          {steps.map(([number, title, text]) => (
            <article className="step-card" key={number}>
              <span className="step-number">{number}</span><span className="step-line" />
              <h3>{title}</h3><p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section section-cream" id="occasions">
        <div className="section-heading gift-centered-heading">
          <div><p className="section-kicker">Made for their moment</p><h2>For their kind of special.</h2></div>
          <p>Start with an occasion, then make it completely personal with the memories behind it.</p>
        </div>
        <div className="occasion-grid">
          {occasions.map(([title, text, href], index) => (
            <Link className="occasion-card occasion-photo-card" href={href} key={title}>
              <GiftingImage scene={sceneForOccasion(href.slice("/occasions/".length))} sizes="(max-width: 800px) calc(100vw - 40px), (max-width: 1300px) 32vw, 400px" decorative />
              <span className="occasion-number">0{index + 1}</span>
              <div><h3>{title}</h3><p>{text}</p></div>
              <span className="occasion-arrow"><ArrowIcon /></span>
            </Link>
          ))}
        </div>
        <p className="imagery-note">Illustrative AI scenes, inspired by the moments a song can celebrate.</p>
        <p className="occasion-season-links">Planning a holiday gift? {holidayOccasions.map((holiday, index) => <span key={holiday.slug}>{index > 0 && " · "}<Link href={`/occasions/${holiday.slug}`}>{holiday.name} songs</Link></span>)}</p>
      </section>

      <div className="home-pricing"><SongPrice compact /></div>

      <section className="section home-guides" aria-labelledby="home-guides-heading">
        <div className="section-heading"><div><p className="section-kicker">Before you press play</p><h2 id="home-guides-heading">Make the words yours. Make the gift feel right.</h2></div><p>A few practical checks help your story become a song you can give with confidence.</p></div>
        <div className="guide-grid">
          <article><p className="section-kicker">Check the words</p><h3><Link href="/guides/review-lyrics-before-music">Review names, memories and the chorus</Link></h3><p>See a fictional before-and-after edit, save the approved version and understand what a free audio preview lets you check.</p><Link className="text-link" href="/guides/review-lyrics-before-music">Read the lyric checklist →</Link></article>
          <article><p className="section-kicker">Give the song</p><h3><Link href="/guides/give-a-personal-song-gift">Plan a listening moment they will enjoy</Link></h3><p>Create and test a private gift link, add a short greeting and keep a downloaded copy ready for the occasion.</p><Link className="text-link" href="/guides/give-a-personal-song-gift">Read the sharing guide →</Link></article>
        </div>
      </section>

      <section className="section faq-section" id="faq">
        <p className="section-kicker">Good to know</p><h2>Questions, answered.</h2>
        <div className="faq-list">
          {faqs.map(([question, answer]) => (
            <details key={question}><summary>{question}</summary><p>{answer}</p></details>
          ))}
        </div>
      </section>

    </main>
  );
}
