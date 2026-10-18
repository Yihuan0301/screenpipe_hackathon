import type { Metadata } from "next";
import { Syne } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});
const pitchDisplay = Syne({
  subsets: ["latin"],
  variable: "--font-pitch-display",
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: "FounderHUD — Pitch",
  description:
    "Screen is the Universal API. Cross-platform founder ops, automated.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${pitchDisplay.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
