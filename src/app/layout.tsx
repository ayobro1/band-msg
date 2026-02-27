import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Band Chat",
  description: "A Discord-style chat app for your band",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
