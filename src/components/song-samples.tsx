"use client";
import { useRef, useState } from "react";
import Link from "next/link";
export type SongSample = { title: string; occasion: string; style: string; url: string; demo?: boolean };
export function SongSamples({ samples }: { samples: SongSample[] }) {
  const [failed, setFailed] = useState<string[]>([]);
  const players = useRef<(HTMLAudioElement | null)[]>([]);
  return <section className="section sample-section" id="samples" aria-label="Song samples"><p className="section-kicker">A little inspiration</p><h2>Hear how a story can feel.</h2><p className="sample-intro">Listen to public examples, then bring your own memories. Your account shows any available free audio preview. Pay once for the complete song and download.</p><div className="sample-grid">{samples.map((sample, index) => <article className="sample-card" key={sample.url}><p className="section-kicker">{sample.occasion}</p><h3>{sample.title}</h3><p>{sample.style}</p>{sample.demo === true && <p className="sample-demo-note">Original AI demo · fictional story</p>}<audio ref={player => { players.current[index] = player; }} controls preload="none" src={sample.url} aria-label={`Sample: ${sample.title}`} onPlay={() => players.current.forEach((player, i) => { if (i !== index) player?.pause(); })} onError={() => setFailed(current => current.includes(sample.url) ? current : [...current, sample.url])} />{failed.includes(sample.url) && <p role="status">This sample is temporarily unavailable. <button type="button" className="text-button" onClick={() => { setFailed(current => current.filter(url => url !== sample.url)); players.current[index]?.load(); }}>Retry sample</button></p>}</article>)}</div><Link className="text-link sample-create-link" href="/create">Start with your own free lyrics →</Link></section>;
}
