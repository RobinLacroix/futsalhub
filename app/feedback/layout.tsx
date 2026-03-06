import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'Questionnaire séance - FutsalHub',
  description: 'Donnez votre ressenti après l\'entraînement'
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#0f172a'
};

export default function FeedbackLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
