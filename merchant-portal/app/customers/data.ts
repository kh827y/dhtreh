export type CustomerStatus = "ACTIVE" | "INACTIVE" | "BLOCKED";

export type CustomerTag =
  | "vip"
  | "dr"
  | "no_spam"
  | "complaint"
  | "new";

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email?: string;
  birthday?: string;
  status: CustomerStatus;
  totalPurchases: number;
  totalAmount: number;
  balance: number;
  level?: string;
  tags: CustomerTag[];
  lastVisit?: string;
  visits: number;
}

export const mockCustomers: Customer[] = [
  {
    id: "cust-1001",
    name: "Алексей Иванов",
    phone: "+7 912 000-00-01",
    email: "ivanov@example.com",
    birthday: "1991-03-12",
    status: "ACTIVE",
    totalPurchases: 58,
    totalAmount: 326000,
    balance: 1850,
    level: "Золото",
    tags: ["vip", "no_spam"],
    lastVisit: "2025-03-22T18:35:00+03:00",
    visits: 11,
  },
  {
    id: "cust-1002",
    name: "Мария Петрова",
    phone: "+7 965 220-45-67",
    status: "ACTIVE",
    totalPurchases: 24,
    totalAmount: 122500,
    balance: 620,
    level: "Серебро",
    tags: ["dr", "new"],
    lastVisit: "2025-03-18T14:12:00+03:00",
    visits: 5,
  },
  {
    id: "cust-1003",
    name: "Сергей Смирнов",
    phone: "+7 900 335-78-90",
    email: "sergey@example.com",
    status: "BLOCKED",
    totalPurchases: 13,
    totalAmount: 42800,
    balance: 0,
    tags: ["complaint"],
    lastVisit: "2025-02-04T12:05:00+03:00",
    visits: 2,
  },
  {
    id: "cust-1004",
    name: "Наталья Ким",
    phone: "+7 921 880-33-44",
    email: "nat.kim@example.com",
    birthday: "1996-07-01",
    status: "INACTIVE",
    totalPurchases: 7,
    totalAmount: 18300,
    balance: 120,
    level: "Бронза",
    tags: [],
    lastVisit: "2024-12-25T09:48:00+03:00",
    visits: 0,
  },
];

export const statusLabels: Record<CustomerStatus, string> = {
  ACTIVE: "Активен",
  INACTIVE: "Не активен",
  BLOCKED: "Заблокирован",
};

export const tagLabels: Record<CustomerTag, string> = {
  vip: "VIP",
  dr: "День рождения",
  no_spam: "Не беспокоить",
  complaint: "Жалоба",
  new: "Новый",
};
