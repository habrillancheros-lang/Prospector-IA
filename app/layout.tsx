import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Company Finder",
  description: "Find and compare companies with AI. Save and revisit your conversations.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="h-dvh">
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var theme;try{theme=localStorage.getItem("company-finder-theme")}catch(e){}var dark=theme==="dark"||(theme!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",dark);document.documentElement.style.colorScheme=dark?"dark":"light"})()`,
          }}
        />
        {children}
      </body>
    </html>
  );
}
