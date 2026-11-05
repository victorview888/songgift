"use client";

import { useState } from "react";

export function AdminAudioPlayer({ src }: { src: string }) {
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  return <div className="admin-audio-player">
    <audio key={attempt} controls preload="none" src={src} onError={() => setError(true)}>浏览器不支持音频播放。</audio>
    {error && <p role="alert">暂时无法播放。请确认后台访问权限、音频文件及访问日志配置后重试。<button className="admin-button admin-button-quiet" type="button" onClick={() => { setError(false); setAttempt(value => value + 1); }}>重新加载</button></p>}
  </div>;
}
