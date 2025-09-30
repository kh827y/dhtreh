export default function LoyaltyPromotionsDocsPage() {
  return (
    <div>
      <h2>LoyaltyPromotion — акции программы лояльности</h2>
      <p>
        Новая сущность <code>LoyaltyPromotion</code> заменяет legacy-кампании. Все операции (создание, редактирование,
        активация, архивирование) выполняются через REST API <code>/portal/loyalty/promotions</code> под токеном мерчанта.
      </p>

      <h3>CRUD и статусы</h3>
      <ul>
        <li>
          <code>GET /portal/loyalty/promotions?status=ALL|ACTIVE|PAUSED|SCHEDULED|COMPLETED|ARCHIVED</code> — список с
          агрегациями (участники, начисленные баллы, аудитория).
        </li>
        <li>
          <code>POST /portal/loyalty/promotions</code> — создание акции. Поля: название, аудитория, награда, расписание,
          флаги push-уведомлений, произвольный <code>metadata</code>.
        </li>
        <li>
          <code>PUT /portal/loyalty/promotions/:id</code> — обновление. Статусы меняются отдельным вызовом
          <code>POST /portal/loyalty/promotions/:id/status</code> (ACTIVE/PAUSED/ARCHIVED).
        </li>
        <li>
          <code>POST /portal/loyalty/promotions/bulk/status</code> — массовая смена статусов.
        </li>
        <li>
          <code>GET /portal/loyalty/promotions/:id</code> — карточка с участниками (<code>PromotionParticipant</code>),
          статистикой (участники, начисленные баллы, среднее вознаграждение) и аудиторией.
        </li>
      </ul>

      <h3>Экспорт и аналитика</h3>
      <p>
        В отчёте <code>GET /reports/export/:merchantId?type=campaigns&amp;format=excel</code> добавлен лист «Акции». Он собирает
        данные из таблиц <code>loyalty_promotions</code> и <code>promotion_participants</code>, отражает периоды действия,
        количество активаций, начисленные баллы и статус. Эти же данные используются на дашборде кампаний портала.
      </p>

      <h3>Нотификации</h3>
      <ul>
        <li>
          Email: <code>POST /email/campaign</code> использует <code>promotionId</code> и подставляет название/период акции в
          шаблон <code>campaign</code>. Письмо доступно только клиентам с email.
        </li>
        <li>
          Push: <code>PushService.sendCampaignNotification(promotionId, customerIds, ...)</code> читает
          <code>metadata.legacyCampaign.kind</code> для типа и передаёт название акции в payload. Используется для маркетинговых
          рассылок и напоминаний.
        </li>
        <li>
          Telegram: CommunicationTask хранит <code>promotionId</code> — статус отправки/архивирования синхронизирован с акцией.
        </li>
      </ul>

      <h3>Советы по миграции</h3>
      <ol>
        <li>При переносе старых кампаний скопируйте полезные поля в <code>metadata.legacyCampaign</code> — UI показывает бейджи и сроки оттуда.</li>
        <li>Все новые уведомления отправляйте с явным <code>promotionId</code>, чтобы CRM и отчёты связывали события с акцией.</li>
        <li>Для массовых остановок используйте <code>bulk/status</code>, чтобы не терять историю <code>archivedAt</code>.</li>
      </ol>
    </div>
  );
}
