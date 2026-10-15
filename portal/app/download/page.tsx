import type { Metadata } from "next";
import Link from "next/link";
import { env } from "@/lib/env";
import { latestRelease, versionLabel } from "@/lib/updates";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Download" };

export default async function DownloadPage() {
  const release = await latestRelease();
  const url = env().DOWNLOAD_URL || (release ? `/updates/${encodeURIComponent(release.file)}` : "");
  return (
    <div className="card narrow featured">
      <span className="eyebrow">Sorts for Windows</span>
      <h2 style={{ marginTop: 10 }}>Download{release ? ` · ${versionLabel(release.version)}` : ""}</h2>
      {url ? (
        <p><a className="btn" href={url}>Download the Sorts installer</a></p>
      ) : (
        <div className="alert warn">No version has been published yet. Run <b>npm run release</b> in the desktop project, or set DOWNLOAD_URL.</div>
      )}
      <ol className="steps">
        <li>Run the installer. Windows may warn about an unknown publisher; choose <b>More info → Run anyway</b>.</li>
        <li>Open <b>Sorts</b> and enter your keys on the first-run screen.</li>
        <li>Click <b>Account → Connect account</b> and confirm the code on this website.</li>
      </ol>
      <p className="small muted">
        Sorts updates itself: when a new version is out, it downloads in the background and asks to restart.
      </p>
      <p className="small muted">
        No account yet? <Link href="/signup">Start a free trial</Link>.
      </p>
    </div>
  );
}
