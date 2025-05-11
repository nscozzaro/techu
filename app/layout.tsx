import type { Metadata } from "next";

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
        <html lang="en">
            <body>{children}</body>
        </html>
    );
} 