import type { Metadata } from "next";
import './globals.css';
import { Noto_Sans_JP } from 'next/font/google';

const notoSansJP = Noto_Sans_JP({
    subsets: ['latin'],
    weight: ['300', '400', '500'],
    display: 'swap',
});

export const metadata: Metadata = {
    title: "Card Grid",
    description: "Responsive card grid landing page",
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en" className={notoSansJP.className}>
            <body>{children}</body>
        </html>
    );
} 