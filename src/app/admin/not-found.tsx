import Link from "next/link";

export default function AdminNotFound() {
  return <main className="admin-access-message"><Link href="/" className="admin-brand">♪ songgift</Link><p className="admin-eyebrow">访问受限</p><h1>无法访问这个后台页面</h1><p>当前账号没有管理员访问权限，或该页面尚未开放。你仍可在个人歌曲库查看自己的歌曲。</p><div className="admin-inline-actions"><Link href="/my-songs" className="admin-button">我的歌曲</Link><Link href="/" className="admin-button admin-button-quiet">返回网站</Link></div></main>;
}
