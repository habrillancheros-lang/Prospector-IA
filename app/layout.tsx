import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Prospector AI",
  description:
    "Describe the companies you want to reach. Get a ranked shortlist with clear reasons for every match.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="h-dvh">
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var theme;try{theme=localStorage.getItem("company-finder-theme")}catch(e){}var dark=theme!=="light";document.documentElement.classList.toggle("dark",dark);document.documentElement.style.colorScheme=dark?"dark":"light"})()`,
          }}
        />
        {children}
      </body>
    </html>
  );
}
