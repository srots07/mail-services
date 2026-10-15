import type { Metadata } from "next";
import { Geist, Geist_Mono, Poppins } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { currentUser } from "@/lib/auth";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
/** Wordmark only: the geometric face of the Sorts logo. */
const sortsFont = Poppins({ variable: "--font-sorts", subsets: ["latin"], weight: ["700"] });

export const metadata: Metadata = {
  title: { default: "Sorts · Personalised email campaigns from your own Gmail", template: "%s · Sorts" },
  description: "Sorts writes a personalised version of your email for every contact, you approve each one, then it sends from your own Gmail. Runs on your Windows PC.",
  applicationName: "Sorts",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser().catch(() => null);
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${sortsFont.variable}`}>
      <body>
        <div className="nav-wrap">
          <nav className="nav" aria-label="Main">
            <Link href="/" className="brand" aria-label="Sorts home">
              <img src="/brand/sorts-mark.svg" alt="" width={28} height={28} />
              <span className="wordmark">Sorts</span>
            </Link>
            <div className="links">
              <Link href="/download" className="hide-sm">Download</Link>
              {user ? (
                <>
                  <Link href="/account">Account</Link>
                  <form action="/api/auth/logout" method="post">
                    <button className="btn secondary" type="submit">Log out</button>
                  </form>
                </>
              ) : (
                <>
                  <Link href="/login">Log in</Link>
                  <Link href="/signup" className="btn">Start free trial</Link>
                </>
              )}
            </div>
          </nav>
        </div>
        <main>{children}</main>
        <footer className="footer">
          <span>© Sorts · Review-first AI outreach</span>
          <span>Sends only from your Gmail, only after you approve.</span>
        </footer>
      </body>
    </html>
  );
}
