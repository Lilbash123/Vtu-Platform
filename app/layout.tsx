import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'QuickVTU',
  description: 'One wallet for airtime, data, cable and electricity.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
