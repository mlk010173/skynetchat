import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SKYNET",
  description: "SKYNET — chat de IA com servidor, conta e histórico de verdade. Estética de terminal, código 100% próprio.",
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  width: "device-width",
  initialScale: 1,
};

const themeScript = `
try {
  var t = localStorage.getItem("skynet-theme");
  document.body.className = t === "theme-white" ? "theme-white" : "theme-black";
} catch (e) {}
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="theme-black">
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {children}
      </body>
    </html>
  );
}
