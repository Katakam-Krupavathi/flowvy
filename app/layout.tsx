import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ClerkProvider, UserButton, SignedIn, SignedOut } from "@clerk/nextjs";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Flowvy - Visual AI Workflow Builder",
  description: "Visual AI & Media Workflow Builder with React Flow",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}>
      <html lang="en">
        <body className={inter.className}>
          <SignedIn>
            <div className="fixed top-3 right-3 z-50">
              <UserButton afterSignOutUrl="/sign-in" />
            </div>
          </SignedIn>
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
