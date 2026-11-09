"use client";

export default function AdminError() {
  return <main className="admin-access-message" role="alert"><h1>暂时无法加载后台</h1><p>请稍后重试。</p><button className="admin-button" type="button" onClick={() => window.location.reload()}>重新加载</button></main>;
}
