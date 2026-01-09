export default function MiniappDocs() {
  return (
    <div>
      <h2>Мини‑аппа и Telegram Deep Links</h2>
      <p>Каждый мерчант может подключить своего Telegram‑бота. Мини‑аппа открывается по deep‑link:</p>
      <pre style={{ whiteSpace:'pre-wrap', wordBreak:'break-word' }}>{`https://t.me/<bot_username>/startapp?startapp=<merchantId>`}</pre>
      <p>Мини‑аппа определяет <code>merchantId</code> в приоритете:</p>
      <ul>
        <li><b>?merchantId=</b> в query</li>
        <li><b>start_param</b>/<b>startapp</b> из Telegram WebApp (если открыт внутри Telegram)</li>
        <li>переменная окружения по умолчанию</li>
      </ul>
      <p>При наличии <code>initData</code> мини‑аппа вызывает <code>POST /loyalty/teleauth</code> и передаёт <code>merchantId</code> для валидации HMAC бот‑токеном мерчанта. Если <code>initData</code> отсутствует (страницу открыли вне Telegram), интерфейс мгновенно показывает предупреждение «Откройте мини‑аппу внутри Telegram» и не пытается работать в браузере.</p>
      <p><code>/loyalty/teleauth</code> возвращает <code>customerId</code> (ранее <code>merchantCustomerId</code>) и флаги <code>hasPhone</code>/<code>onboarded</code>, поэтому фронт может решить, показывать ли мастер профиля, без дополнительных запросов.</p>
      <p>Сразу после авторизации фронт делает один запрос <code>GET /loyalty/bootstrap</code>, чтобы получить профиль, согласия, баланс, уровни, историю и акции за один RTT. Это ускоряет старт мини‑аппы на мобильных сетях.</p>
      <p>Запросы мини‑аппы, которые работают с данными клиента (профиль, баланс, история, промо, отзывы и т.д.), выполняются с заголовком <code>Authorization: tma &lt;initData&gt;</code>. API валидирует подпись Telegram и отклоняет обращения без этого заголовка.</p>
      <p>Публичные настройки и каталог уровней доступны без авторизации.</p>
      <p>Параметры темы (цвет/фон/логотип) берутся из публичных настроек мерчанта и автоматически применяются в интерфейсе.</p>
      <p>Основные цвета задаются через поля <code>miniappThemePrimary</code> (accent) и <code>miniappThemeBg</code> (фон) в <code>publicSettings</code>. Эти значения приходят тем же JSON, что и остальная конфигурация, поэтому отдельной просадки по скорости загрузки мини‑аппы не даёт.</p>
    </div>
  );
}
