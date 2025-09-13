export const metadata = {
  title: 'Cashier',
  description: 'Virtual cashier terminal',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
