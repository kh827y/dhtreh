export default function MiniappDocs() {
  return (
    <div>
      <h2>Мини‑аппа и Telegram Deep Links</h2>
      <p>Каждый мерчант может подключить своего Telegram‑бота. Мини‑аппа открывается по deep‑link:</p>
      <pre style={{ whiteSpace:'pre-wrap', wordBreak:'break-word' }}>{`https://t.me/<bot_username>/startapp?startapp=<merchantId>`}</pre>
      <p>Мини‑аппа определяет <code>merchantId</code> в приоритете:</p>
      <ul>
        <li><b>start_param</b> из Telegram WebApp (если открыт внутри Telegram)</li>
        <li><b>?merchantId=</b> в query</li>
        <li>последний сегмент пути (<code>/miniapp/&lt;merchantId&gt;</code>)</li>
        <li>переменная окружения по умолчанию</li>
      </ul>
      <p>При наличии <code>initData</code> мини‑аппа вызывает <code>POST /loyalty/teleauth</code> и передаёт <code>merchantId</code> для валидации HMAC бот‑токеном мерчанта. Если <code>initData</code> отсутствует (страницу открыли вне Telegram), интерфейс мгновенно показывает предупреждение «Откройте мини‑аппу внутри Telegram» и не пытается работать в браузере.</p>
      <p><code>/loyalty/teleauth</code> возвращает не только <code>merchantCustomerId</code>, но и флаги <code>hasPhone</code>/<code>onboarded</code>, поэтому фронт может решить, показывать ли мастер профиля, без дополнительных запросов.</p>
      <p>Сразу после авторизации фронт делает один запрос <code>GET /loyalty/bootstrap</code>, чтобы получить профиль, согласия, баланс, уровни, историю и акции за один RTT. Это ускоряет старт мини‑аппы на мобильных сетях.</p>
      <p>Все дальнейшие запросы мини‑аппы (профиль, промо, отзывы, регистрационный бонус и т.д.) выполняются с заголовком <code>Authorization: tma &lt;initData&gt;</code>. API валидирует подпись Telegram и отклоняет обращения без этого заголовка.</p>
      <p>Параметры темы (цвет/фон/логотип) берутся из публичных настроек мерчанта и автоматически применяются в интерфейсе.</p>
    </div>
  );
}
