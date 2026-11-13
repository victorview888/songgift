import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { AccountHeader } from "@/components/account-header";
import { JsonLd } from "@/components/json-ld";
import { guideBySlug, guides } from "@/lib/guides";
import { publicPageMetadata, absoluteUrl } from "@/lib/seo";
export function generateStaticParams() {
  return guides.map((g) => ({ slug: g.slug }));
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const g = guideBySlug((await params).slug);
  return g
    ? publicPageMetadata(
        g.title + " | SongGift",
        g.description,
        "/guides/" + g.slug,
      )
    : { robots: { index: false, follow: false } };
}
export default async function GuidePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const g = guideBySlug((await params).slug);
  if (!g) notFound();
  const structured = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { name: "Home", item: absoluteUrl("/") },
      { name: "Guides", item: absoluteUrl("/guides") },
      { name: g.title, item: absoluteUrl("/guides/" + g.slug) },
    ].map((v, i) => ({ "@type": "ListItem", position: i + 1, ...v })),
  };
  return (
    <main className="form-page">
      <AccountHeader />
      <article className="guide-article">
        <JsonLd
          data={[
            structured,
            {
              "@context": "https://schema.org",
              "@type": "Article",
              headline: g.title,
              description: g.description,
              url: absoluteUrl("/guides/" + g.slug),
              mainEntityOfPage: absoluteUrl("/guides/" + g.slug),
              author: {
                "@type": "Organization",
                name: "SongGift",
                url: absoluteUrl("/"),
              },
            },
          ]}
        />
        <nav aria-label="Breadcrumb">
          <Link href="/">Home</Link> / <Link href="/guides">Guides</Link>
        </nav>
        <p className="section-kicker">
          {g.category} · {g.minutes} min read
        </p>
        <h1>{g.title}</h1>
        <p className="guide-intro">{g.description}</p>
        <nav className="guide-toc" aria-label="In this guide">
          <strong>In this guide</strong>
          {g.sections.map((s, i) => (
            <a key={s.title} href={"#section-" + i}>
              {s.title}
            </a>
          ))}
        </nav>
        {g.sections.map((s, i) => (
          <section id={"section-" + i} key={s.title}>
            <h2>{s.title}</h2>
            {s.paragraphs.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </section>
        ))}
        <section>
          <h2>Common questions</h2>
          {g.faq.map((f) => (
            <details key={f.q}>
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </section>
        <aside>
          <h2>Make something personal.</h2>
          <p>
            Explore{" "}
            <Link href={"/occasions/" + g.occasion}>
              {g.occasion} song ideas
            </Link>
            , read <Link href="/pricing">pricing and what is included</Link>, or{" "}
            <Link href="/create">start your story</Link>.
          </p>
          <h3>Keep reading</h3>
          {guides
            .filter((other) => other.slug !== g.slug)
            .map((other) => (
              <p key={other.slug}>
                <Link href={"/guides/" + other.slug}>{other.title} →</Link>
              </p>
            ))}
        </aside>
      </article>
    </main>
  );
}
