"use client";
import React from 'react';
import { Button, Card, CardBody, Skeleton, Progress } from '@loyalty/ui';
import {
  Settings,
  Store,
  Users,
  Sparkles,
  CreditCard,
  Bell,
  CheckCircle2,
  Circle,
  ArrowRight,
  Zap,
  Shield,
  Gift,
  Rocket,
  ChevronRight,
} from 'lucide-react';

type SetupStep = {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  href: string;
  completed: boolean;
  optional?: boolean;
};

type SetupConfig = {
  hasLoyaltySettings: boolean;
  hasOutlets: boolean;
  hasStaff: boolean;
  hasMechanics: boolean;
  hasWallet: boolean;
  hasPush: boolean;
};

export default function Page() {
  const [loading, setLoading] = React.useState(true);
  const [config, setConfig] = React.useState<SetupConfig | null>(null);

  React.useEffect(() => {
    const loadConfig = async () => {
      try {
        const res = await fetch('/api/portal/setup-status');
        if (res.ok) {
          const data = await res.json();
          setConfig(data);
        } else {
          // Default config if API not available
          setConfig({
            hasLoyaltySettings: false,
            hasOutlets: false,
            hasStaff: false,
            hasMechanics: false,
            hasWallet: false,
            hasPush: false,
          });
        }
      } catch {
        setConfig({
          hasLoyaltySettings: false,
          hasOutlets: false,
          hasStaff: false,
          hasMechanics: false,
          hasWallet: false,
          hasPush: false,
        });
      } finally {
        setLoading(false);
      }
    };
    loadConfig();
  }, []);

  const steps: SetupStep[] = React.useMemo(() => {
    if (!config) return [];
    return [
      {
        id: 'loyalty',
        title: 'Настройка программы лояльности',
        description: 'Укажите ставки начисления и списания баллов, лимиты и время жизни бонусов',
        icon: <Sparkles size={24} />,
        href: '/settings/system',
        completed: config.hasLoyaltySettings,
      },
      {
        id: 'outlets',
        title: 'Добавление торговых точек',
        description: 'Создайте торговые точки, где будет работать программа лояльности',
        icon: <Store size={24} />,
        href: '/settings/outlets',
        completed: config.hasOutlets,
      },
      {
        id: 'staff',
        title: 'Добавление сотрудников',
        description: 'Пригласите сотрудников и назначьте им роли и права доступа',
        icon: <Users size={24} />,
        href: '/settings/staff',
        completed: config.hasStaff,
      },
      {
        id: 'mechanics',
        title: 'Настройка механик',
        description: 'Включите бонусы на день рождения, реферальную программу и другие механики',
        icon: <Gift size={24} />,
        href: '/loyalty/mechanics',
        completed: config.hasMechanics,
      },
      {
        id: 'wallet',
        title: 'Карта Wallet',
        description: 'Создайте цифровую карту лояльности для Apple Wallet и Google Pay',
        icon: <CreditCard size={24} />,
        href: '/wallet',
        completed: config.hasWallet,
        optional: true,
      },
      {
        id: 'push',
        title: 'Push-уведомления',
        description: 'Настройте автоматические уведомления о начислении баллов и акциях',
        icon: <Bell size={24} />,
        href: '/loyalty/push',
        completed: config.hasPush,
        optional: true,
      },
    ];
  }, [config]);

  const completedCount = steps.filter(s => s.completed).length;
  const requiredSteps = steps.filter(s => !s.optional);
  const completedRequired = requiredSteps.filter(s => s.completed).length;
  const progress = requiredSteps.length > 0 ? (completedRequired / requiredSteps.length) * 100 : 0;
  const isFullyConfigured = completedRequired === requiredSteps.length;

  return (
    <div className="animate-in" style={{ display: 'grid', gap: 32 }}>
      {/* Hero Section */}
      <section style={{ position: 'relative' }}>
        <div style={{
          position: 'absolute',
          top: -100,
          right: -100,
          width: 400,
          height: 400,
          background: 'radial-gradient(circle, rgba(99, 102, 241, 0.15) 0%, transparent 70%)',
          pointerEvents: 'none',
          filter: 'blur(60px)',
        }} />
        
        <div style={{ position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 24 }}>
            <div style={{
              width: 56,
              height: 56,
              borderRadius: 'var(--radius-lg)',
              background: 'var(--brand-gradient)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              boxShadow: '0 8px 32px rgba(99, 102, 241, 0.3)',
            }}>
              <Rocket size={28} />
            </div>
            <div>
              <h1 style={{
                fontSize: 32,
                fontWeight: 800,
                letterSpacing: '-0.03em',
                margin: 0,
                background: 'linear-gradient(135deg, var(--fg) 0%, var(--fg-secondary) 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}>
                Мастер настройки
              </h1>
              <p style={{
                fontSize: 16,
                color: 'var(--fg-muted)',
                margin: '8px 0 0',
                maxWidth: 500,
              }}>
                Пройдите все шаги для запуска программы лояльности вашего бизнеса
              </p>
            </div>
          </div>

          {/* Progress Card */}
          <Card style={{ marginBottom: 32 }}>
            <CardBody style={{ padding: 24 }}>
              {loading ? (
                <div style={{ display: 'grid', gap: 16 }}>
                  <Skeleton height={20} />
                  <Skeleton height={8} />
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <div>
                      <div style={{ fontSize: 14, color: 'var(--fg-muted)', marginBottom: 4 }}>
                        Прогресс настройки
                      </div>
                      <div style={{ fontSize: 24, fontWeight: 700 }}>
                        {completedRequired} из {requiredSteps.length} шагов
                      </div>
                    </div>
                    {isFullyConfigured && (
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '8px 16px',
                        borderRadius: 'var(--radius-full)',
                        background: 'rgba(16, 185, 129, 0.15)',
                        color: 'var(--success-light)',
                        fontWeight: 600,
                        fontSize: 14,
                      }}>
                        <CheckCircle2 size={18} />
                        Настройка завершена
                      </div>
                    )}
                  </div>
                  <Progress value={progress} size="lg" variant={isFullyConfigured ? 'success' : 'default'} />
                </>
              )}
            </CardBody>
          </Card>
        </div>
      </section>

      {/* Setup Steps */}
      <section>
        <h2 style={{
          fontSize: 18,
          fontWeight: 700,
          marginBottom: 20,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}>
          <Zap size={20} style={{ color: 'var(--brand-primary-light)' }} />
          Обязательные шаги
        </h2>
        
        <div style={{ display: 'grid', gap: 12 }}>
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}>
                <CardBody style={{ padding: 20 }}>
                  <div style={{ display: 'flex', gap: 16 }}>
                    <Skeleton height={48} style={{ width: 48, borderRadius: 'var(--radius-md)' }} />
                    <div style={{ flex: 1 }}>
                      <Skeleton height={20} style={{ width: '40%', marginBottom: 8 }} />
                      <Skeleton height={14} style={{ width: '70%' }} />
                    </div>
                  </div>
                </CardBody>
              </Card>
            ))
          ) : (
            steps.filter(s => !s.optional).map((step, index) => (
              <SetupStepCard key={step.id} step={step} index={index} />
            ))
          )}
        </div>
      </section>

      {/* Optional Steps */}
      <section>
        <h2 style={{
          fontSize: 18,
          fontWeight: 700,
          marginBottom: 20,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}>
          <Shield size={20} style={{ color: 'var(--fg-muted)' }} />
          Дополнительные настройки
        </h2>
        
        <div style={{ display: 'grid', gap: 12 }}>
          {loading ? (
            Array.from({ length: 2 }).map((_, i) => (
              <Card key={i}>
                <CardBody style={{ padding: 20 }}>
                  <div style={{ display: 'flex', gap: 16 }}>
                    <Skeleton height={48} style={{ width: 48, borderRadius: 'var(--radius-md)' }} />
                    <div style={{ flex: 1 }}>
                      <Skeleton height={20} style={{ width: '40%', marginBottom: 8 }} />
                      <Skeleton height={14} style={{ width: '70%' }} />
                    </div>
                  </div>
                </CardBody>
              </Card>
            ))
          ) : (
            steps.filter(s => s.optional).map((step, index) => (
              <SetupStepCard key={step.id} step={step} index={index + requiredSteps.length} />
            ))
          )}
        </div>
      </section>

      {/* Quick Links */}
      {!loading && isFullyConfigured && (
        <section>
          <Card variant="gradient" glow>
            <CardBody style={{ padding: 32 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 24 }}>
                <div>
                  <h3 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 8px' }}>
                    Отличная работа! 🎉
                  </h3>
                  <p style={{ fontSize: 15, color: 'var(--fg-secondary)', margin: 0 }}>
                    Программа лояльности настроена. Перейдите в аналитику для отслеживания результатов.
                  </p>
                </div>
                <Button 
                  variant="primary"
                  onClick={() => location.href = '/analytics'}
                  style={{ gap: 8 }}
                >
                  Открыть аналитику
                  <ArrowRight size={18} />
                </Button>
              </div>
            </CardBody>
          </Card>
        </section>
      )}
    </div>
  );
}

function SetupStepCard({ step, index }: { step: SetupStep; index: number }) {
  return (
    <a
      href={step.href}
      style={{
        textDecoration: 'none',
        display: 'block',
      }}
    >
      <Card 
        hover
        style={{
          transition: 'all 0.3s ease',
          cursor: 'pointer',
        }}
      >
        <CardBody style={{ padding: 0 }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            padding: 20,
          }}>
            {/* Step Number / Status */}
            <div style={{
              position: 'relative',
              width: 52,
              height: 52,
              borderRadius: 'var(--radius-md)',
              background: step.completed 
                ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(52, 211, 153, 0.1))'
                : 'linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(139, 92, 246, 0.1))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: step.completed ? 'var(--success-light)' : 'var(--brand-primary-light)',
              flexShrink: 0,
            }}>
              {step.completed ? (
                <CheckCircle2 size={24} />
              ) : (
                step.icon
              )}
            </div>

            {/* Content */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 4,
              }}>
                <h3 style={{
                  fontSize: 16,
                  fontWeight: 600,
                  margin: 0,
                  color: 'var(--fg)',
                }}>
                  {step.title}
                </h3>
                {step.completed && (
                  <span style={{
                    fontSize: 11,
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: 'var(--radius-full)',
                    background: 'rgba(16, 185, 129, 0.15)',
                    color: 'var(--success-light)',
                  }}>
                    Готово
                  </span>
                )}
                {step.optional && !step.completed && (
                  <span style={{
                    fontSize: 11,
                    fontWeight: 500,
                    padding: '2px 8px',
                    borderRadius: 'var(--radius-full)',
                    background: 'rgba(148, 163, 184, 0.15)',
                    color: 'var(--fg-muted)',
                  }}>
                    Опционально
                  </span>
                )}
              </div>
              <p style={{
                fontSize: 14,
                color: 'var(--fg-muted)',
                margin: 0,
                lineHeight: 1.5,
              }}>
                {step.description}
              </p>
            </div>

            {/* Arrow */}
            <div style={{
              width: 36,
              height: 36,
              borderRadius: 'var(--radius-sm)',
              background: 'rgba(255, 255, 255, 0.05)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--fg-muted)',
              flexShrink: 0,
              transition: 'all 0.2s ease',
            }}>
              <ChevronRight size={20} />
            </div>
          </div>
        </CardBody>
      </Card>
    </a>
  );
}
