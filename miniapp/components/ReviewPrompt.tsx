"use client";

import React from "react";

type ReviewPromptProps = {
  visible: boolean;
  onClose: () => void;
  onSubmit: (rating: number, comment: string) => void;
  transactionId?: string;
  loading?: boolean;
};

export const ReviewPrompt: React.FC<ReviewPromptProps> = ({ visible, onClose, onSubmit, loading }) => {
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

  const disabled = rating === 0 || loading;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(23,24,43,0.5)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        padding: '0 16px 24px',
        zIndex: 90,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 460,
          background: '#ffffff',
          borderRadius: '22px 22px 0 0',
          padding: '24px 20px 26px',
          boxShadow: '0 -18px 40px rgba(42, 47, 89, 0.18)',
          display: 'grid',
          gap: 18,
          position: 'relative',
        }}
      >
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: 12,
            right: 16,
            border: 'none',
            background: 'transparent',
            color: '#6b7280',
            cursor: 'pointer',
            fontSize: 20,
          }}
          aria-label="Закрыть"
        >
          ✕
        </button>
        <div style={{ display: 'grid', gap: 6 }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Оцените визит</div>
          <div style={{ fontSize: 13, color: '#6b7280' }}>Ваш отзыв поможет нам улучшить сервис.</div>
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
                  transition: 'transform 0.1s ease, opacity 0.1s ease',
                  transform: active ? 'scale(1.05)' : 'scale(1)',
                  opacity: active ? 1 : 0.6,
                  padding: 0,
                }}
                aria-label={`Оценка ${star}`}
              >
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path
                    d="M12 2.5l2.9 6.14 6.78.54-5.15 4.63 1.57 6.64L12 17.72l-6.1 2.73 1.57-6.64-5.15-4.63 6.78-.54L12 2.5z"
                    fill={active ? '#FACC15' : 'none'}
                    stroke="#FACC15"
                    strokeWidth={1.4}
                  />
                </svg>
              </button>
            );
          })}
        </div>

        <div style={{ display: 'grid', gap: 6 }}>
          <label style={{ fontSize: 13, color: '#6b7280' }}>Комментарий (необязательно)</label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Напишите, что понравилось или что можно улучшить"
            style={{
              padding: 12,
              minHeight: 96,
              borderRadius: 14,
              border: '1px solid rgba(148,163,184,0.35)',
              background: '#f8fafc',
              color: '#111827',
              resize: 'vertical',
            }}
          />
        </div>

        <button
          onClick={() => {
            if (disabled) return;
            onSubmit(rating, comment.trim());
          }}
          disabled={disabled}
          style={{
            padding: '14px 16px',
            borderRadius: 14,
            border: 'none',
            background: disabled ? 'rgba(148,163,184,0.25)' : 'linear-gradient(135deg,#22c55e,#16a34a)',
            color: disabled ? '#9ca3af' : '#ffffff',
            fontWeight: 700,
            fontSize: 15,
            cursor: disabled ? 'not-allowed' : 'pointer',
            transition: 'opacity 0.1s ease',
          }}
        >
          {loading ? 'Отправка…' : 'Отправить'}
        </button>
      </div>
    </div>
  );
};
