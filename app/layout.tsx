import type { Metadata, Viewport } from "next";
import { Syne, Inter, Archivo, Archivo_Narrow } from "next/font/google";
import "./globals.css";

const syne = Syne({
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
  variable: "--font-syne",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-inter",
});

// Police display du webapp — identique à celle chargée en .ttf côté mobile
// (mobile/assets/fonts/Archivo-*.ttf), pour que titres et gros chiffres
// rendent pareil sur les deux apps.
const archivo = Archivo({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-archivo",
});

// "Archivo Condensed" (utilisée en .ttf côté mobile) n'existe pas comme
// famille statique distincte sur Google Fonts / next/font — Archivo Narrow
// Bold est le substitut le plus proche pour les en-têtes de tableau condensés.
const archivoCondensed = Archivo_Narrow({
  subsets: ["latin"],
  weight: ["700"],
  variable: "--font-archivo-condensed",
});

export const metadata: Metadata = {
  title: "FutsalHub — Conçu pour le terrain",
  description: "Séances, analyses de matchs, schémas tactiques et bibliothèque d'exercices.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className="dark">
      <body className={`${syne.variable} ${inter.variable} ${archivo.variable} ${archivoCondensed.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
