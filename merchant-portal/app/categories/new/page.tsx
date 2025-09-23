"use client";
import React from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardBody, Button } from "@loyalty/ui";
import RichTextEditor from "../../../components/RichTextEditor";

const EXISTING_SLUGS = ["pizza", "desserts", "drinks"];
const PARENT_OPTIONS = [
  { id: "root", name: "Без родителя" },
  { id: "c-1", name: "Пицца" },
  { id: "c-2", name: "Десерты" },
  { id: "c-3", name: "Напитки" },
];

const transliterate = (value: string): string => {
  const map: Record<string, string> = {
    а: "a",
    б: "b",
    в: "v",
    г: "g",
    д: "d",
    е: "e",
    ё: "e",
    ж: "zh",
    з: "z",
    и: "i",
    й: "y",
    к: "k",
    л: "l",
    м: "m",
    н: "n",
    о: "o",
    п: "p",
    р: "r",
    с: "s",
    т: "t",
    у: "u",
    ф: "f",
    х: "h",
    ц: "ts",
    ч: "ch",
    ш: "sh",
    щ: "sch",
    ы: "y",
    э: "e",
    ю: "yu",
    я: "ya",
  };
  return value
    .toLowerCase()
    .split("")
    .map((char) => map[char as keyof typeof map] ?? char)
    .join("");
};

const slugify = (value: string): string =>
  transliterate(value)
    .replace(/[^a-z0-9\-\s]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

export default function CreateCategoryPage() {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [slug, setSlug] = React.useState("");
  const [slugEdited, setSlugEdited] = React.useState(false);
  const [description, setDescription] = React.useState("");
  const [parent, setParent] = React.useState("root");
  const [error, setError] = React.useState("");
  const [toast, setToast] = React.useState("");
  const [imageSrc, setImageSrc] = React.useState<string | null>(null);
  const blobRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!slugEdited) {
      setSlug(slugify(name));
    }
  }, [name, slugEdited]);

  React.useEffect(() => {
    return () => {
      if (blobRef.current) URL.revokeObjectURL(blobRef.current);
    };
  }, []);

  React.useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const handleSlugChange = (value: string) => {
    setSlugEdited(true);
    setSlug(value.replace(/[^a-z0-9\-]/gi, "").toLowerCase());
  };

  const pickImage = (files: FileList | null) => {
    if (!files || !files.length) return;
    const [file] = files;
    if (blobRef.current) {
      URL.revokeObjectURL(blobRef.current);
    }
    const url = URL.createObjectURL(file);
    blobRef.current = url;
    setImageSrc(url);
  };

  const validate = () => {
    if (!name.trim()) {
      setError("Заполните название категории");
      return false;
    }
    if (!slug) {
      setError("Адрес (slug) не может быть пустым");
      return false;
    }
    if (EXISTING_SLUGS.includes(slug)) {
      setError("Такой адрес уже используется, выберите другой");
      return false;
    }
    setError("");
    return true;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    setToast("Категория создана (демо). Возврат к списку...");
    window.setTimeout(() => router.push("/categories"), 600);
  };

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "grid", gap: 4 }}>
          <h1 style={{ margin: 0 }}>Новая категория</h1>
          <div style={{ opacity: 0.75, fontSize: 14 }}>Заполните карточку и вернитесь в список.</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="ghost" onClick={() => router.push("/categories")}>
            Отменить
          </Button>
          <Button variant="primary" onClick={handleSubmit}>
            Создать
          </Button>
        </div>
      </div>

      {toast && (
        <div className="glass" style={{ padding: "12px 16px", borderRadius: 12, border: "1px solid rgba(37,211,102,0.25)" }}>
          {toast}
        </div>
      )}

      <Card>
        <CardHeader title="Карточка категории" subtitle="Укажите название, изображение и адрес" />
        <CardBody style={{ display: "grid", gap: 16 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, opacity: 0.7 }}>Название *</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Например, Пицца"
              required
              style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.3)", color: "inherit" }}
            />
          </label>

          <div style={{ display: "grid", gap: 12 }}>
            <span style={{ fontWeight: 600 }}>Изображение категории</span>
            <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
              <div
                style={{
                  width: 160,
                  height: 160,
                  borderRadius: 16,
                  overflow: "hidden",
                  background: "rgba(255,255,255,0.05)",
                  border: "1px dashed rgba(255,255,255,0.15)",
                  display: "grid",
                  placeItems: "center",
                }}
              >
                {imageSrc ? (
                  <img src={imageSrc} alt={name || "Превью категории"} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <div style={{ textAlign: "center", fontSize: 12, opacity: 0.7 }}>
                    1200×1200<br />1:1
                  </div>
                )}
              </div>
              <label className="btn btn-secondary" style={{ cursor: "pointer" }}>
                Загрузить изображение
                <input type="file" accept="image/*" style={{ display: "none" }} onChange={(event) => pickImage(event.target.files)} />
              </label>
            </div>
          </div>

          <RichTextEditor
            value={description}
            onChange={setDescription}
            label="Описание"
            placeholder="Добавьте текст о том, что входит в категорию, рекомендации и особенности"
          />

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, opacity: 0.7 }}>Адрес (slug) *</span>
            <input
              value={slug}
              onChange={(event) => handleSlugChange(event.target.value)}
              placeholder="latini-ca"
              style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.3)", color: "inherit" }}
            />
            <span style={{ fontSize: 12, opacity: 0.6 }}>
              Используйте латинские буквы и дефис. Адрес будет проверен на уникальность.
            </span>
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, opacity: 0.7 }}>Родительская категория</span>
            <select
              value={parent}
              onChange={(event) => setParent(event.target.value)}
              style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.3)", color: "inherit" }}
            >
              {PARENT_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </label>

          {error && <div style={{ color: "#f87171", fontSize: 13 }}>{error}</div>}
        </CardBody>
      </Card>
    </div>
  );
}
