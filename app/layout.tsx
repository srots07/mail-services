import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Poppins } from "next/font/google";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { ToastProvider } from "@/components/ui/toast";
import { themeBoot } from "@/lib/theme-boot";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/** Wordmark only: the geometric face of the Sorts logo. */
const sortsFont = Poppins({
  variable: "--font-sorts",
  subsets: ["latin"],
  weight: ["700"],
});

export const metadata: Metadata = {
  title: { default: "Sorts", template: "%s · Sorts" },
  description: "Sorts writes a personalised version of your email for every contact, you approve each one, then it sends from your own Gmail.",
  applicationName: "Sorts",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#070a10" },
    { media: "(prefers-color-scheme: light)", color: "#f4f6fb" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-theme="dark"
      data-density="comfortable"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${sortsFont.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <script dangerouslySetInnerHTML={{ __html: themeBoot }} />
        <ThemeProvider>
          <ToastProvider>{children}</ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
