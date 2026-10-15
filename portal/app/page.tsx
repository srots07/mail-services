import Link from "next/link";
import { env } from "@/lib/env";

const STEPS = [
  { title: "Contacts", body: "Upload Excel, CSV or PDF. Invalid and duplicate emails are flagged first." },
  { title: "Mail body", body: "Paste or upload your email. Placeholders fill from each row." },
  { title: "Sender", body: "Pick your signature and up to 10 CC addresses." },
  { title: "AI drafts", body: "Light edits per contact. Your format and meaning stay." },
  { title: "Review", body: "See every email exactly as it will be sent. Edit, approve or reject." },
  { title: "Send", body: "Now or scheduled, one recipient per email, from your Gmail." },
  { title: "Results", body: "Live status per email, retry failures, export to CSV." },
];

export default function Home() {
  const e = env();
  return (
    <>
      <section className="hero">
        <span className="eyebrow">Review-first AI outreach</span>
        <h1>One email in. A personal version for every contact out.</h1>
        <p className="lead">
          Sorts tailors your email to each contact with AI, shows you every draft to approve, then sends it from your own Gmail. It runs on your
          Windows PC, so your contact lists stay on it.
        </p>
        <div className="row">
          <Link href="/signup" className="btn">Start your {e.TRIAL_DAYS}-day free trial</Link>
          <Link href="/download" className="btn secondary">Download for Windows</Link>
        </div>
        <p className="small subtle" style={{ marginTop: 12 }}>No card needed for the trial.</p>
      </section>

      <section className="section" aria-labelledby="how">
        <span className="eyebrow">How it works</span>
        <h2 id="how">Seven steps, and you approve before anything is sent</h2>
        <p className="muted">Every campaign follows the same path in the app, from an uploaded list to delivered emails.</p>
        <ol className="flow">
          {STEPS.map((s, i) => (
            <li key={s.title}>
              <span className="n">{i + 1}</span>
              <b>{s.title}</b>
              <span className="d">{s.body}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="section" aria-labelledby="pricing">
        <span className="eyebrow">Pricing</span>
        <h2 id="pricing">One plan, billed monthly or yearly</h2>
        <div className="grid">
          <div className="card">
            <h3>Monthly</h3>
            <div className="price">{e.PRICE_MONTHLY_LABEL}</div>
            <ul className="features">
              <li>Unlimited campaigns and contacts</li>
              <li>AI personalisation for every email</li>
              <li>Up to {e.MAX_DEVICES} PCs</li>
              <li>Cancel any time</li>
            </ul>
            <Link href="/signup?plan=monthly" className="btn secondary">Choose monthly</Link>
          </div>
          <div className="card featured cut">
            <h3>Yearly</h3>
            <div className="price">{e.PRICE_YEARLY_LABEL}</div>
            <ul className="features">
              <li>Everything in monthly</li>
              <li>Two months free</li>
              <li>Up to {e.MAX_DEVICES} PCs</li>
              <li>Cancel any time</li>
            </ul>
            <Link href="/signup?plan=yearly" className="btn">Choose yearly</Link>
          </div>
          <div className="card">
            <h3>Getting started</h3>
            <ol className="steps">
              <li>Create an account here; your free trial starts at once.</li>
              <li>Download and install Sorts for Windows.</li>
              <li>In Sorts, click <b>Connect account</b> and confirm the code on this website.</li>
              <li>Subscribe before the trial ends to keep sending.</li>
            </ol>
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="trust">
        <span className="eyebrow">Why it&apos;s safe</span>
        <h2 id="trust">Built so nothing goes out by accident</h2>
        <div className="trust">
          <div className="card">
            <h3>Nothing sends automatically</h3>
            <p>AI only writes drafts. Sending needs your approval and a typed confirmation for every campaign.</p>
          </div>
          <div className="card">
            <h3>Your Gmail, send-only</h3>
            <p>Connected with Google sign-in and the send-only permission. Sorts can&apos;t read your inbox and never stores your password.</p>
          </div>
          <div className="card">
            <h3>Local first</h3>
            <p>Contacts and drafts stay in a database on your PC, and your keys are encrypted for your Windows account. This website only handles your subscription and app updates.</p>
          </div>
        </div>
      </section>
    </>
  );
}
