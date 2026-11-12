"""Publish a bounded public-source report with short-lived GitHub OIDC identity."""
import json
import os
from pathlib import Path
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ENDPOINT = "https://www.songforalways.com/api/internal/radar/reports"


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def publish(path):
    body = path.read_bytes()
    if not 0 < len(body) <= 128 * 1024:
        raise ValueError("Invalid report size")
    report = json.loads(body)
    if report["runId"] != os.environ["GITHUB_RUN_ID"] or str(report["runAttempt"]) != os.environ["GITHUB_RUN_ATTEMPT"] or report["commitSha"] != os.environ["GITHUB_SHA"]:
        raise ValueError("Report does not belong to this workflow run")
    opener = urllib.request.build_opener(NoRedirect)
    for attempt in range(5):
        try:
            request_url = os.environ["ACTIONS_ID_TOKEN_REQUEST_URL"]
            # The request URL is supplied by GitHub; do not allow forwarding its bearer elsewhere.
            parsed = urllib.parse.urlsplit(request_url)
            if parsed.scheme != "https" or not parsed.hostname or not parsed.hostname.endswith(".actions.githubusercontent.com") or parsed.username or parsed.password:
                raise ValueError("Invalid GitHub identity endpoint")
            query = urllib.parse.parse_qsl(parsed.query, keep_blank_values=True)
            query = [(k, v) for k, v in query if k != "audience"] + [("audience", ENDPOINT)]
            request_url = urllib.parse.urlunsplit(parsed._replace(query=urllib.parse.urlencode(query)))
            req = urllib.request.Request(request_url, headers={"Authorization": "Bearer " + os.environ["ACTIONS_ID_TOKEN_REQUEST_TOKEN"]})
            with opener.open(req, timeout=20) as response:
                token = json.loads(response.read(30000))["value"]
            req = urllib.request.Request(ENDPOINT, data=body, headers={"Content-Type": "application/json", "Authorization": "Bearer " + token, "User-Agent": "SongGift-Free-Radar/1"}, method="POST")
            with opener.open(req, timeout=35) as response:
                result = json.loads(response.read(1000))
                if response.status not in (200, 201) or result.get("id") != report["runId"] + "-" + str(report["runAttempt"]):
                    raise ValueError("Unexpected upload result")
            print("Report saved to SongGift admin (idempotent upload).")
            return
        except urllib.error.HTTPError as exc:
            # Never log headers, JWTs, response bodies or query strings.
            print(f"Report upload HTTP {exc.code}; attempt {attempt + 1}/5")
            if exc.code not in (429, 500, 502, 503, 504) or attempt == 4:
                raise RuntimeError("Report upload rejected") from None
        except (urllib.error.URLError, TimeoutError, ConnectionError):
            print(f"Report upload transport unavailable; attempt {attempt + 1}/5")
            if attempt == 4:
                raise RuntimeError("Report upload transport failed") from None
        time.sleep(10 * (attempt + 1))


if __name__ == "__main__":
    publish(Path(sys.argv[1] if len(sys.argv) > 1 else "radar-report.json"))
