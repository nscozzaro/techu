import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Techu",
  description: "A card battle on a 5x5 grid",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
