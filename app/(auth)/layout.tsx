import { CheckCheck, KeyRound, PenLine } from "lucide-react";
import { HeroScene } from "@/components/scene/hero-scene";
import { SortsAmbient } from "@/components/sorts/ambient";
import { SortsLogo } from "@/components/sorts/logo";
import { ThemeSwitcher } from "@/components/theme/theme-switcher";

const PROMISES = [
  { icon: PenLine, title: "Your email, fitted to each contact", body: "The AI makes light edits per row and keeps your format and meaning. If it can't, your original text is used." },
  { icon: CheckCheck, title: "Nothing sends without you", body: "Every email is reviewed and approved before it goes out, one recipient per email." },
  { icon: KeyRound, title: "Sent from your own Gmail", body: "Connected with Google sign-in and send-only access. Your password is never stored." },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative grid min-h-screen bg-canvas lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <aside className="relative hidden overflow-hidden border-r border-line lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16" aria-label="About Sorts">
        <SortsAmbient grid={false} />
        <HeroScene />
        <div className="relative">
          <SortsLogo size={36} priority />
        </div>
        <div className="relative max-w-md">
          <p className="type-mono-label flex items-center gap-2 text-accent-strong">
            <span aria-hidden className="h-px w-4 bg-[image:var(--sorts-gradient-line)]" />
            Review-first AI outreach
          </p>
          <h1 className="type-display mt-4 text-fg">
            One email in.
            <br />A personal version for every contact out.
          </h1>
          <ul className="mt-10 space-y-5">
            {PROMISES.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-3.5">
                <span className="sorts-cut flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-line-strong bg-panel/70 text-accent-strong backdrop-blur">
                  <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                </span>
                <div>
                  <p className="type-h4 text-fg">{title}</p>
                  <p className="type-caption mt-0.5 text-muted">{body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className="type-caption relative text-subtle">Contacts → AI drafts → your approval → sent.</p>
      </aside>

      <div className="relative flex min-h-screen flex-col px-4 py-6 sm:px-8">
        <div className="pointer-events-none absolute inset-0 lg:hidden" aria-hidden>
          <SortsAmbient fade="bottom" />
        </div>
        <div className="relative flex items-center justify-between">
          <span className="lg:invisible">
            <SortsLogo size={28} priority />
          </span>
          <ThemeSwitcher />
        </div>
        <main className="relative mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">{children}</main>
        <p className="type-caption relative text-center text-subtle lg:hidden">Every email is reviewed by you before Sorts sends it.</p>
      </div>
    </div>
  );
}
