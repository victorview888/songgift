import { ArrowIcon } from "@/components/arrow-icon";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AccountHeader } from "@/components/account-header";
import { occasionSlugs, occasions } from "@/lib/occasions";
import { absoluteUrl, publicPageMetadata } from "@/lib/seo";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return occasionSlugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const occasion = occasions[slug];
  if (!occasion) return {};
  return publicPageMetadata(occasion.title, occasion.description, `/occasions/${slug}`);
}

export default async function OccasionPage({ params }: Props) {
  const { slug } = await params;
  const occasion = occasions[slug];
  if (!occasion) notFound();

  return (
    <main className="occasion-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: absoluteUrl("/") },
          { "@type": "ListItem", position: 2, name: `${occasion.name} songs`, item: absoluteUrl(`/occasions/${slug}`) },
        ],
      }) }} />
      <AccountHeader />
      <div className="occasion-shell">
        <nav className="occasion-breadcrumb" aria-label="Breadcrumb"><Link href="/">Home</Link><span aria-hidden="true">/</span><span>{occasion.name} songs</span></nav>

        <section className="occasion-hero">
          <div>
            <p className="section-kicker">A song for the occasion</p>
            <h1>{occasion.heading}</h1>
            <p>{occasion.introduction}</p>
            <Link className="primary-button" href="/create">Create a {occasion.name.toLowerCase()} song <ArrowIcon /></Link>
          </div>
          <div className="occasion-art" aria-hidden="true"><span>♪</span><p>{occasion.name}<br />memories,<br /><em>made into music.</em></p></div>
        </section>

        <section className="occasion-guide" aria-labelledby="occasion-guide-heading">
          <div className="occasion-section-heading"><p className="section-kicker">Make it personal</p><h2 id="occasion-guide-heading">What to include in your {occasion.name.toLowerCase()} song</h2><p>You do not need a script. Start with a few real details and write as you would to someone you love.</p></div>
          <div className="occasion-idea-grid">
            {occasion.ideas.map((idea, index) => <article key={idea.heading}><span className="occasion-number">0{index + 1}</span><h3>{idea.heading}</h3><p>{idea.detail}</p></article>)}
          </div>
        </section>

        <section className="occasion-writing" aria-labelledby="occasion-example-heading">
          <div><p className="section-kicker">A place to start</p><h2 id="occasion-example-heading">Try telling the story like this.</h2><p>This is an example of what you could put in the story field. Use your own memories and words when you create your song.</p></div>
          <blockquote>“{occasion.prompt}”</blockquote>
        </section>

        <section className="occasion-finish" aria-labelledby="occasion-finish-heading">
          <div><p className="section-kicker">Make it sound like them</p><h2 id="occasion-finish-heading">Choose the feeling, then review the words.</h2><p>{occasion.mood}</p><p>After sharing your story, you can review and edit the lyrics. When they feel right, complete checkout to create the music. Your finished song is saved to your account for playback and download.</p></div>
          <div className="occasion-answer"><h3>{occasion.question}</h3><p>{occasion.answer}</p></div>
        </section>

        <section className="occasion-next" aria-label="Other occasions"><h2>Find another moment worth singing about.</h2><div>{occasionSlugs.filter((other) => other !== slug).map((other) => <Link key={other} href={`/occasions/${other}`}>{occasions[other].name} songs <ArrowIcon /></Link>)}</div></section>
      </div>
      <footer className="occasion-footer"><Link href="/">SongGift</Link><Link href="/create">Create a song <ArrowIcon /></Link></footer>
    </main>
  );
}
