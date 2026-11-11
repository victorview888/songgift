import { ArrowIcon } from "@/components/arrow-icon";
import Link from "next/link";
import { HomeMenu } from "@/components/home-menu";
import { SongSamples } from "@/components/song-samples";
import { publicSongSamples } from "@/lib/song-samples";
import { SongPrice } from "@/components/song-price";
import { publicSongPriceUsd } from "@/lib/pricing";

export const dynamic = "force-dynamic";
import { AccountNav } from "@/components/account-nav";
import { publicPageMetadata, websiteStructuredData } from "@/lib/seo";
import { JsonLd } from "@/components/json-ld";

export const metadata = publicPageMetadata(
  "Personalized Song Gifts from Your Story | SongGift",
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

function Brand() {
  return (
    <span className="brand">
      <span className="brand-mark" aria-hidden="true">♪</span>
      songgift
    </span>
  );
}

export default function Home() {
  const samples = publicSongSamples();
  return (
    <main>
      <JsonLd data={websiteStructuredData()} />
      <header className="site-header home-header">
        <Link className="brand-link" href="/" aria-label="SongGift home"><Brand /></Link>
        <nav className="desktop-nav" aria-label="Main navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#occasions">Occasions</a>
          <Link href="/pricing">Pricing</Link>
          <a href="#faq">FAQ</a>
        </nav>
        <div className="header-actions"><HomeMenu /><AccountNav /><Link className="header-cta" href="/create">Create a song <ArrowIcon /></Link></div>
      </header>

      <section className="hero-section">
        <div className="hero-copy">
          <p className="eyebrow"><span className="eyebrow-dot" />Personalized song gifts, made from your memories</p>
          <h1>Your story.
Their favorite song.</h1>
          <p className="hero-description">
            Turn the names, memories and little moments only you know into a personal AI song. Read your lyrics for free, then bring them to life.
          </p>
          <div className="hero-actions">
            <Link className="primary-button" href="/create">Create their song <ArrowIcon /></Link>
            <a className="text-link" href={samples.length ? "#samples" : "#how-it-works"}>{samples.length ? "Hear a sample" : "See how it works"} <span aria-hidden="true">↓</span></a>
          </div>
          <p className="hero-note"><span aria-hidden="true">✦</span> Free lyric preview · US${publicSongPriceUsd()} per song · USD / PayPal</p>
        </div>

        <div className="hero-art" role="img" aria-label="A record made for a special memory">
          <div className="art-orbit art-orbit-one" />
          <div className="art-orbit art-orbit-two" />
          <div className="album-card">
            <div className="album-top"><span>SONGGIFT / 001</span><span>FOR SOMEONE SPECIAL</span></div>
            <div className="record-wrap"><div className="record"><div className="record-label">♪</div></div></div>
            <div className="album-bottom">
              <div><small>A SONG ABOUT</small><strong>The moments<br />that matter</strong></div>
              <div className="waveform" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /></div>
            </div>
          </div>
          <span className="floating-note note-one">for you</span>
          <span className="floating-note note-two">made with feeling</span>
        </div>
      </section>

      <div className="trust-strip">
        <span>Made for the moments words cannot quite hold</span>
        <div><strong>Personal</strong><strong>Original</strong><strong>Made to keep</strong></div>
      </div>

      {samples.length > 0 && <SongSamples samples={samples} />}

      <section className="section" id="how-it-works">
        <div className="section-heading">
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
        <div className="section-heading">
          <div><p className="section-kicker">Made for their moment</p><h2>For their kind of special.</h2></div>
          <p>Start with an occasion, then make it completely personal with the memories behind it.</p>
        </div>
        <div className="occasion-grid">
          {occasions.map(([title, text, href], index) => (
            <Link className="occasion-card" href={href} key={title}>
              <span className="occasion-number">0{index + 1}</span>
              <div><h3>{title}</h3><p>{text}</p></div>
              <span className="occasion-arrow"><ArrowIcon /></span>
            </Link>
          ))}
        </div>
      </section>

      <div className="home-pricing"><SongPrice compact /></div>

      <section className="section faq-section" id="faq">
        <p className="section-kicker">Good to know</p><h2>Questions, answered.</h2>
        <div className="faq-list">
          {faqs.map(([question, answer]) => (
            <details key={question}><summary>{question}</summary><p>{answer}</p></details>
          ))}
        </div>
      </section>

      <footer className="site-footer">
        <div className="footer-main">
          <div><Link className="brand-link footer-brand-link" href="/"><Brand /></Link><p>Turn the moments that matter into music.</p></div>
          <div className="footer-links"><Link href="/my-songs">My Songs</Link><Link href="/create">Create a song</Link><Link href="/occasions">Explore song occasions</Link><Link href="/occasions/birthday">Birthday songs</Link><Link href="/occasions/wedding">Wedding songs</Link><Link href="/occasions/anniversary">Anniversary songs</Link><Link href="/help">Help</Link></div>
        </div>
      </footer>
    </main>
  );
}
