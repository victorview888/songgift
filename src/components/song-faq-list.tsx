import Link from "next/link";
import type { SongFaq } from "@/lib/song-faqs";

export function SongFaqList({ items, idPrefix }: { items: SongFaq[]; idPrefix: string }) {
  return <div className="faq-list song-faq-list">{items.map(item => (
    <details key={item.id} id={`${idPrefix}-${item.id}`}>
      <summary>{item.question}</summary>
      <div className="song-faq-answer"><p>{item.answer}</p>
        {item.links && <div className="song-faq-links">{item.links.map(link => <Link key={link.href} href={link.href}>{link.label} <span aria-hidden="true">→</span></Link>)}</div>}
      </div>
    </details>
  ))}</div>;
}
