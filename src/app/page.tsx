import Link from "next/link";

const steps = [
  ["01", "Tell us the story", "Share the names, memories, and details that make this person special."],
  ["02", "Shape the feeling", "Choose a mood and music direction, then review the lyrics."],
  ["03", "Press play", "Receive an original song made around the story only you could tell."],
];

const occasions = [
  ["Birthday", "A surprise they will remember long after the candles are gone."],
  ["Wedding", "The little moments that made your love story yours."],
  ["Anniversary", "Celebrate the years, places, and memories you share."],
  ["Family", "A song for a parent, child, grandparent, or chosen family."],
  ["Pet", "A joyful tribute for the companion always by your side."],
  ["In memory", "Keep a meaningful story close with a song full of heart."],
];

const faqs = [
  ["What do I need to create a song?", "Just a few personal details and a story. The small moments often make the most meaningful lyrics."],
  ["Can I review the lyrics first?", "Yes. You can read and refine the lyrics before moving on to the finished song."],
  ["What occasions work best?", "Birthdays, weddings, anniversaries, family celebrations, pet tributes, and remembrance are all good starting points."],
  ["Can I choose the mood?", "Yes. Choose from warm, joyful, romantic, nostalgic, peaceful, or uplifting directions."],
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
  return (
    <main>
      <header className="site-header">
        <Link className="brand-link" href="/" aria-label="SongGift home"><Brand /></Link>
        <nav className="desktop-nav" aria-label="Main navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#occasions">Occasions</a>
          <a href="#faq">FAQ</a>
        </nav>
        <Link className="header-cta" href="/create">Create a song <span aria-hidden="true">↗</span></Link>
      </header>

      <section className="hero-section">
        <div className="hero-copy">
          <p className="eyebrow"><span className="eyebrow-dot" />Original songs made from real memories</p>
          <h1>Turn one unforgettable story into a song made just for them.</h1>
          <p className="hero-description">
            The most personal gifts start with the details only you know. Tell us the story, and turn it into a song they can keep forever.
          </p>
          <div className="hero-actions">
            <Link className="primary-button" href="/create">Create their song <span aria-hidden="true">↗</span></Link>
            <a className="text-link" href="#how-it-works">See how it works <span aria-hidden="true">↓</span></a>
          </div>
          <p className="hero-note"><span aria-hidden="true">✦</span> Start with a free preview · No card required</p>
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

      <section className="section" id="how-it-works">
        <div className="section-heading">
          <div><p className="section-kicker">The simple part</p><h2>A memory becomes music in three thoughtful steps.</h2></div>
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
          <div><p className="section-kicker">Made for their moment</p><h2>Some stories deserve their own soundtrack.</h2></div>
          <p>Start with an occasion, then make it completely personal with the memories behind it.</p>
        </div>
        <div className="occasion-grid">
          {occasions.map(([title, text], index) => (
            <Link className="occasion-card" href="/create" key={title}>
              <span className="occasion-number">0{index + 1}</span>
              <div><h3>{title}</h3><p>{text}</p></div>
              <span className="occasion-arrow" aria-hidden="true">↗</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="delivery-section">
        <div className="delivery-copy"><p className="section-kicker">A gift with a heartbeat</p><h2>More than a recording. It is your story, heard out loud.</h2></div>
        <div className="delivery-list">
          <div><span>01</span><strong>Personalized lyrics</strong><p>Your names, details, and memories stay at the center.</p></div>
          <div><span>02</span><strong>An original song</strong><p>Created from your direction and shaped for the occasion.</p></div>
          <div><span>03</span><strong>Easy to share</strong><p>Play it together, send it as a surprise, or keep it close.</p></div>
        </div>
      </section>

      <section className="quote-section">
        <span className="quote-mark" aria-hidden="true">“</span>
        <blockquote>The best gifts are the ones that make someone say,{" "}
          <em>“How did you remember all of that?”</em>
        </blockquote>
        <Link className="light-button" href="/create">Start their song <span aria-hidden="true">↗</span></Link>
      </section>

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
          <div className="footer-links"><Link href="/create">Create a song</Link><a href="#how-it-works">How it works</a><a href="#faq">FAQ</a></div>
        </div>
        <div className="footer-bottom"><span>© 2026 SongGift</span><span>Made for meaningful moments</span></div>
      </footer>
    </main>
  );
}
