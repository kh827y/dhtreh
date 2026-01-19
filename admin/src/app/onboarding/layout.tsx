export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding: 16 }}>
      <h2>Онбординг мерчанта</h2>
      <ol>
        <li><a href="/onboarding/connect-bot">1. Подключить бота</a></li>
        <li><a href="/onboarding/plan">2. Тариф и реквизиты</a></li>
        <li><a href="/onboarding/cashback">3. Процент кэшбека</a></li>
        <li><a href="/onboarding/qr">4. QR для печати</a></li>
      </ol>
      <div style={{ marginTop: 16 }}>{children}</div>
    </div>
  );
}
