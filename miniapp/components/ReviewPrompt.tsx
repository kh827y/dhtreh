"use client";

import React from "react";

type ReviewPromptProps = {
  visible: boolean;
  onClose: () => void;
  onSubmit: (rating: number, comment: string) => void;
  transactionId?: string;
};

export const ReviewPrompt: React.FC<ReviewPromptProps> = ({ visible, onClose, onSubmit }) => {
  const [rating, setRating] = React.useState(0);
  const [hover, setHover] = React.useState(0);
  const [comment, setComment] = React.useState("");

  React.useEffect(() => {
    if (visible) {
      setRating(0);
      setHover(0);
      setComment("");
    }
  }, [visible]);

  if (!visible) return null;

  const stars = [1, 2, 3, 4, 5];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15,23,42,0.65)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        zIndex: 80,
      }}
    >
      <div
        style={{
          maxWidth: 360,
          width: '100%',
          background: 'linear-gradient(160deg, #0f172a, #111827)',
          borderRadius: 18,
          border: '1px solid rgba(148,163,184,0.18)',
          color: '#f8fafc',
          display: 'grid',
          gap: 16,
          padding: '24px 24px 20px',
          boxShadow: '0 24px 60px rgba(15,23,42,0.4)',
          position: 'relative',
        }}
      >
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            border: 'none',
            background: 'transparent',
            color: '#94a3b8',
            cursor: 'pointer',
            fontSize: 18,
          }}
          aria-label="Закрыть"
        >
          ×
        </button>
        <div style={{ display: 'grid', gap: 6 }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Оцените визит</div>
          <div style={{ fontSize: 13, opacity: 0.75 }}>Ваш отзыв помогает нам улучшить сервис.</div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 12 }}>
          {stars.map((star) => {
            const active = (hover || rating) >= star;
            return (
              <button
                key={star}
                onMouseEnter={() => setHover(star)}
                onMouseLeave={() => setHover(0)}
                onClick={() => setRating(star)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  transition: 'transform 0.1s ease',
                  transform: active ? 'scale(1.05)' : 'scale(1)',
                  padding: 0,
                }}
                aria-label={`Оценка ${star}`}
              >
                <svg width="42" height="42" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path
                    d="M12 2.5l2.9 6.14 6.78.54-5.15 4.63 1.57 6.64L12 17.72l-6.1 2.73 1.57-6.64-5.15-4.63 6.78-.54L12 2.5z"
                    fill={active ? '#FACC15' : 'none'}
                    stroke="#FACC15"
                    strokeWidth={1.4}
                    opacity={active ? 1 : 0.7}
                  />
                </svg>
              </button>
            );
          })}
        </div>

        <div style={{ display: 'grid', gap: 6 }}>
          <label style={{ fontSize: 13, opacity: 0.75 }}>Комментарий (необязательно)</label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Напишите, что понравилось или что можно улучшить"
            style={{
              padding: 12,
              minHeight: 90,
              borderRadius: 12,
              border: '1px solid rgba(148,163,184,0.24)',
              background: 'rgba(15,23,42,0.4)',
              color: '#f8fafc',
            }}
          />
        </div>

        <button
          onClick={() => {
            if (rating === 0) return;
            onSubmit(rating, comment.trim());
          }}
          disabled={rating === 0}
          style={{
            padding: '12px 16px',
            borderRadius: 12,
            border: 'none',
            background: rating === 0 ? 'rgba(148,163,184,0.2)' : '#22c55e',
            color: rating === 0 ? '#cbd5f5' : '#041314',
            fontWeight: 700,
            cursor: rating === 0 ? 'not-allowed' : 'pointer',
          }}
        >
          Отправить
        </button>
      </div>
    </div>
  );
};
