"""SongGift's free-only adapter around a pinned MIT New Term Radar checkout.

Only the three imported public-data functions run: no daily command, paid modules,
mail delivery, Search Console, database credentials or LLM calls.
"""
import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import sys
from datetime import datetime, timezone
from urllib.parse import quote, urlsplit

UPSTREAM_SHA = "fe67ff1acab728141644a4a9741295469b4feee6"
RELEVANT = re.compile(r"\b(song\w*|music\w*|lyric\w*|audio\w*|singing|vocal\w*|gift\w*|birthday|wedding|anniversary|memorial)\b|歌曲|音乐|歌词|音频|赠礼|礼物", re.I)


def clean(value, limit):
    return re.sub(r"[\x00-\x1f\x7f]", " ", str(value or "")).strip()[:limit]


def safe_url(value):
    value = clean(value, 2048)
    try:
        parsed = urlsplit(value)
        return value if parsed.scheme == "https" and parsed.hostname and not parsed.username and not parsed.password else None
    except ValueError:
        return None


def normalize(raw, sites, run_id, attempt, sha):
    sources, items = [], []

    def source(key, name, data, count, new_count, note):
        error = not isinstance(data, dict) or "error" in data
        status = "error" if error else "baseline" if data.get("first_run") else "ok"
        sources.append({"id": key, "name": name, "status": status,
                        "count": 0 if error else count, "newCount": 0 if error else new_count,
                        # Do not expose upstream exception text (could contain request headers).
                        "note": "公开来源读取失败，保留原快照，下次重试。" if error else note})

    hf = raw.get("hf", {})
    source("hf", "Hugging Face 热门模型与演示", hf, hf.get("models", 0) + hf.get("spaces", 0), len(hf.get("terms", [])), "公开热门榜单对比；新增信号为合并后的名称，不是搜索量。")
    for row in hf.get("terms", []):
        text = " ".join([row.get("term", ""), *row.get("examples", [])])
        if RELEVANT.search(text):
            items.append({"kind": "model", "sourceId": "hf", "title": clean(row.get("term"), 180), "url": "https://huggingface.co/models?search=" + quote(row.get("term", "")), "detail": clean("；".join(row.get("examples", [])), 500)})

    gh = raw.get("breakout", {})
    source("github", "GitHub 新项目增长", gh, gh.get("searched", 0), sum(bool(row.get("new")) for row in gh.get("repos", [])), "观察近 14 天新建项目的公开 Star 增长，仅筛选歌曲、音频与赠礼相关项目。")
    for row in gh.get("repos", []):
        if row.get("new") and RELEVANT.search(row.get("repo", "") + " " + row.get("description", "")):
            items.append({"kind": "repository", "sourceId": "github", "title": clean(row["repo"], 180), "url": safe_url("https://github.com/" + row["repo"]), "detail": clean(f"{row.get('description', '')} · {row.get('stars', 0)} Stars；平均每日 {row.get('velocity', 0)} Stars。不是用户搜索量。", 500)})

    for key, config in sites.items():
        data = raw.get("sitemap", {}).get("sites", {}).get(key, {"error": True})
        source_id = "sitemap:" + key
        source(source_id, config["label"], data, data.get("urls", 0), data.get("new", 0), "公开 Sitemap URL 快照差异；仅表示页面新增，不代表该词有搜索需求。")
        for url in data.get("sample", [])[:8]:
            if safe_url(url):
                items.append({"kind": "page", "sourceId": source_id, "title": clean(urlsplit(url).path or url, 180), "url": url, "detail": "本次 Sitemap 中新出现的页面，请打开来源核对内容与 SongGift 的相关性。"})

    sources.append({"id": "gsc", "name": "Google Search Console", "status": "off", "count": 0, "newCount": 0, "note": "尚未配置只读授权；本报告不包含本站搜索查询、点击或展现。"})
    return {"schemaVersion": 1, "runId": run_id, "runAttempt": attempt, "commitSha": sha,
            "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
            "sources": sources, "items": items[:60]}


def collect(upstream, config_path, state):
    actual = subprocess.check_output(["git", "-C", str(upstream), "rev-parse", "HEAD"], text=True).strip()
    if actual != UPSTREAM_SHA:
        raise ValueError("Upstream revision mismatch")
    sys.path.insert(0, str(upstream.resolve()))
    from radar.config import load
    from radar.sources import hf_new
    from radar.breakout import breakouts
    from radar.sitemaps import diff
    cfg = load(config_path)
    state.mkdir(parents=True, exist_ok=True)
    raw = {}
    for key, fn in [("hf", hf_new), ("breakout", breakouts), ("sitemap", diff)]:
        try:
            raw[key] = fn(cfg, state)
        except Exception:
            raw[key] = {"error": True}
            print(f"{key}: public source unavailable", flush=True)
    return raw, cfg["sitemaps"]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--upstream", type=Path, required=True)
    parser.add_argument("--config", type=Path, default=Path("config/radar.json"))
    parser.add_argument("--state", type=Path, default=Path(".radar-state"))
    parser.add_argument("--out", type=Path, default=Path("radar-report.json"))
    args = parser.parse_args()
    run_id, attempt, sha = os.environ["GITHUB_RUN_ID"], int(os.environ["GITHUB_RUN_ATTEMPT"]), os.environ["GITHUB_SHA"]
    if not re.fullmatch(r"\d{1,20}", run_id) or not 1 <= attempt <= 99999 or not re.fullmatch(r"[a-f0-9]{40}", sha):
        raise ValueError("Invalid GitHub run metadata")
    raw, sites = collect(args.upstream, args.config, args.state)
    report = normalize(raw, sites, run_id, attempt, sha)
    body = json.dumps(report, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    if len(body) > 128 * 1024:
        raise ValueError("Report exceeds upload limit")
    args.out.write_bytes(body)
    print(f"Saved public-source report: {len(report['sources'])} sources, {len(report['items'])} related items, {sum(s['status'] == 'error' for s in report['sources'])} source failures", flush=True)


if __name__ == "__main__":
    main()
