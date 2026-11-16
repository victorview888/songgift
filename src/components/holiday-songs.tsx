import Link from "next/link";
import { ArrowIcon } from "@/components/arrow-icon";
import { featuredHolidays, holidayCreateHref } from "@/lib/holidays";

export function HolidaySongs() {
  const holidays = featuredHolidays();
  if (!holidays.length) return null;
  return <section className="section holiday-section" id="holiday-gifts" aria-labelledby="holiday-heading">
    <div className="section-heading">
      <div><p className="section-kicker">For the season ahead</p><h2 id="holiday-heading">Give them a song this holiday.</h2></div>
      <p>A familiar tradition, a thank-you or a new beginning. Start with free lyrics and make the message your own.</p>
    </div>
    <div className="holiday-grid">
      {holidays.map(holiday => <article className="holiday-card" key={holiday.slug}>
        <p className="section-kicker"><time dateTime={holiday.date}>{holiday.dateLabel}</time></p>
        <h3>{holiday.name}</h3>
        <p>{holiday.description}</p>
        <div className="holiday-actions">
          <Link className="text-link" href={holidayCreateHref(holiday.slug)}>Start their song <ArrowIcon /></Link>
          <Link href={`/occasions/${holiday.slug}`}>Story ideas</Link>
        </div>
      </article>)}
    </div>
    <p className="holiday-note">Read and edit lyrics for free. Pay once for the complete audio; allow time to listen and check your gift before the occasion.</p>
  </section>;
}
