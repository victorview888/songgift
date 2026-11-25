"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { GiftingImage } from "./gifting-image";
import { sceneForOccasion } from "@/lib/gifting-imagery";

export type SongSample = { title: string; occasion: string; style: string; url: string; demo?: boolean };

type SongSamplesProps = {
  samples: SongSample[];
  heading?: string;
  introduction?: string;
  createHref?: string;
};

export function SongSamples({
  samples,
  heading = "Hear how a story can feel.",
  introduction = "Listen to public examples, then bring your own memories. Your account shows any available free audio preview. Pay once for the complete song and download.",
  createHref = "/create",
}: SongSamplesProps) {
  const [failed, setFailed] = useState<string[]>([]);
  const players = useRef<(HTMLAudioElement | null)[]>([]);

  return (
    <section className={"section sample-section" + (samples.length === 1 ? " sample-section-single" : "")} id="samples" aria-label="Song samples">
      <p className="section-kicker">A little inspiration</p>
      <h2>{heading}</h2>
      <p className="sample-intro">{introduction}</p>
      <div className="sample-grid">
        {samples.map((sample, index) => (
          <article className="sample-card" key={sample.url}>
            <div className="sample-artwork" aria-hidden="true">
              <GiftingImage scene={sceneForOccasion(sample.occasion)} sizes="(max-width: 800px) calc(100vw - 40px), 400px" decorative />
            </div>
            <p className="section-kicker">{sample.occasion}</p>
            <h3>{sample.title}</h3>
            <p>{sample.style}</p>
            {sample.demo === true && <p className="sample-demo-note">Original AI demo · fictional story</p>}
            <audio
              ref={player => { players.current[index] = player; }}
              controls
              preload="none"
              src={sample.url}
              aria-label={`Sample: ${sample.title}`}
              onPlay={() => players.current.forEach((player, i) => { if (i !== index) player?.pause(); })}
              onError={() => setFailed(current => current.includes(sample.url) ? current : [...current, sample.url])}
            />
            {failed.includes(sample.url) && (
              <p role="status">
                This sample is temporarily unavailable.{" "}
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setFailed(current => current.filter(url => url !== sample.url));
                    players.current[index]?.load();
                  }}
                >
                  Retry sample
                </button>
              </p>
            )}
          </article>
        ))}
      </div>
      <Link className="text-link sample-create-link" href={createHref}>Start with your own free lyrics →</Link>
    </section>
  );
}
