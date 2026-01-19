"use client";

import React from "react";

export type StarRatingProps = {
  rating: number;
  onChange?: (value: number) => void;
  size?: number;
  interactive?: boolean;
};

export const StarRating: React.FC<StarRatingProps> = ({ rating, onChange, size = 24, interactive = false }) => {
  const stars = [1, 2, 3, 4, 5];
  return (
    <div style={{ display: 'inline-flex', gap: 6 }}>
      {stars.map((star) => {
        const active = rating >= star;
        const Star = (
          <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M12 2.5l2.9 6.14 6.78.54-5.15 4.63 1.57 6.64L12 17.72l-6.1 2.73 1.57-6.64-5.15-4.63 6.78-.54L12 2.5z"
              fill={active ? '#FACC15' : 'none'}
              stroke="#FACC15"
              strokeWidth={1.4}
            />
          </svg>
        );
        if (interactive) {
          return (
            <button
              key={star}
              type="button"
              onClick={() => onChange?.(star)}
              style={{
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                padding: 0,
              }}
              aria-label={`Оценка ${star}`}
            >
              {Star}
            </button>
          );
        }
        return (
          <span
            key={star}
            aria-label={`Оценка ${star}`}
            style={{ display: 'inline-flex', lineHeight: 0 }}
          >
            {Star}
          </span>
        );
      })}
    </div>
  );
};

export default StarRating;
