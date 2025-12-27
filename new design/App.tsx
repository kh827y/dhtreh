import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Dashboard from './components/Dashboard';
import ByTimeAnalytics from './components/ByTimeAnalytics';
import ClientPortrait from './components/ClientPortrait';
import RepeatSales from './components/RepeatSales';
import Dynamics from './components/Dynamics';
import RFMAnalysis from './components/RFMAnalysis';
import OutletActivity from './components/OutletActivity';
import StaffActivity from './components/StaffActivity';
import ReferralAnalytics from './components/ReferralAnalytics';
import LoyaltyMechanics from './components/LoyaltyMechanics';
import Promotions from './components/Promotions';
import PointsPromotions from './components/PointsPromotions';
import PushNotifications from './components/PushNotifications';
import TelegramNewsletters from './components/TelegramNewsletters';
import Promocodes from './components/Promocodes';
import StaffMotivation from './components/StaffMotivation';
import FraudProtection from './components/FraudProtection';
import CashierPanelSettings from './components/CashierPanelSettings';
import Reviews from './components/Reviews';
import Clients from './components/Clients';
import Audiences from './components/Audiences';
import Outlets from './components/Outlets';
import SettingsStaff from './components/SettingsStaff';
import SettingsAccessGroups from './components/SettingsAccessGroups';
import SettingsIntegrations from './components/SettingsIntegrations';
import IntegrationTelegramMiniapp from './components/IntegrationTelegramMiniapp';
import IntegrationRestApi from './components/IntegrationRestApi';
import SettingsTelegramNotifications from './components/SettingsTelegramNotifications';
import SettingsSystem from './components/SettingsSystem';
import ToolsImport from './components/ToolsImport';
import MasterSettings from './components/MasterSettings';
import GoodsList from './components/GoodsList';
import CategoriesList from './components/CategoriesList';
import AutoReturn from './components/AutoReturn';
import BirthdayGreeting from './components/BirthdayGreeting';
import RegistrationPoints from './components/RegistrationPoints';
import ExpirationReminder from './components/ExpirationReminder';
import ReferralSettings from './components/ReferralSettings';
import OperationsLog from './components/OperationsLog';
import Login from './components/Login';
import SubscriptionExpired from './components/SubscriptionExpired';
import { AppView } from './types';
import { ClipboardList } from 'lucide-react';

type AuthStatus = 'authenticated' | 'login' | 'expired';

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<AppView>('summary');
  const [authStatus, setAuthStatus] = useState<AuthStatus>('authenticated');
  
  // Navigation State
  const [targetClientId, setTargetClientId] = useState<string | null>(null);

  // --- Auth Guards ---

  if (authStatus === 'login') {
    return <Login onLogin={() => setAuthStatus('authenticated')} />;
  }

  if (authStatus === 'expired') {
    return <SubscriptionExpired onRenew={() => setAuthStatus('authenticated')} />;
  }

  // --- Handlers ---
  
  const navigateToClient = (clientId: string) => {
      setTargetClientId(clientId);
      setCurrentView('clients');
  };

  // --- Main App Layout ---

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-sans text-slate-900">
      <Sidebar currentView={currentView} onNavigate={(view) => {
          setCurrentView(view);
          if (view !== 'clients') setTargetClientId(null); // Clear target if navigating away manually
      }} />
      
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        <Header 
          onNavigate={setCurrentView} 
          onLogout={() => setAuthStatus('login')}
        />
        
        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-50/50">
          {currentView === 'summary' && <Dashboard />}
          {currentView === 'settings' && <MasterSettings onNavigate={setCurrentView} />}
          {currentView === 'by_time' && <ByTimeAnalytics />}
          {currentView === 'portrait' && <ClientPortrait />}
          {currentView === 'repeat' && <RepeatSales />}
          {currentView === 'dynamics' && <Dynamics />}
          {currentView === 'rfm' && <RFMAnalysis />}
          {currentView === 'outlet' && <OutletActivity />}
          {currentView === 'staff' && <StaffActivity />}
          {currentView === 'referral' && <ReferralAnalytics onNavigate={setCurrentView} />}
          {currentView === 'loyalty_mechanics' && <LoyaltyMechanics onNavigate={setCurrentView} />}
          {currentView === 'loyalty_levels' && <LoyaltyMechanics onNavigate={setCurrentView} initialSection="levels_editor" />}
          {currentView === 'loyalty_limitations' && <LoyaltyMechanics onNavigate={setCurrentView} initialSection="limitations_editor" />}
          {currentView === 'promotions' && <Promotions onNavigate={setCurrentView} />}
          {currentView === 'points_promotions' && <PointsPromotions onNavigate={setCurrentView} />}
          {currentView === 'push_notifications' && <PushNotifications />}
          {currentView === 'telegram_newsletters' && <TelegramNewsletters />}
          {currentView === 'promocodes' && <Promocodes />}
          {currentView === 'staff_motivation' && <StaffMotivation />}
          {currentView === 'fraud_protection' && <FraudProtection />}
          {currentView === 'cashier_panel' && <CashierPanelSettings onNavigate={setCurrentView} />}
          {currentView === 'reviews' && <Reviews />}
          {currentView === 'clients' && <Clients targetClientId={targetClientId} />}
          {currentView === 'audiences' && <Audiences />}
          {currentView === 'goods_list' && <GoodsList />}
          {currentView === 'categories_list' && <CategoriesList />}
          {currentView === 'outlets' && <Outlets />}
          {currentView === 'settings_staff' && <SettingsStaff />}
          {currentView === 'settings_access_groups' && <SettingsAccessGroups />}
          {currentView === 'settings_integrations' && <SettingsIntegrations onNavigate={setCurrentView} />}
          {currentView === 'integration_telegram_miniapp' && <IntegrationTelegramMiniapp onBack={() => setCurrentView('settings_integrations')} />}
          {currentView === 'integration_rest_api' && <IntegrationRestApi onBack={() => setCurrentView('settings_integrations')} />}
          {currentView === 'settings_telegram' && <SettingsTelegramNotifications onNavigate={setCurrentView} />}
          {currentView === 'settings_system' && <SettingsSystem />}
          {currentView === 'tools_import' && <ToolsImport />}
          
          {/* Auto Return Views */}
          {currentView === 'autoreturn' && <AutoReturn initialTab="main" onNavigate={setCurrentView} />}
          {currentView === 'autoreturn_stats' && <AutoReturn initialTab="stats" onNavigate={setCurrentView} />}

          {/* Birthday Views */}
          {currentView === 'birthday' && <BirthdayGreeting initialTab="main" onNavigate={setCurrentView} />}
          {currentView === 'birthday_stats' && <BirthdayGreeting initialTab="stats" onNavigate={setCurrentView} />}

          {/* Registration Points Views */}
          {currentView === 'registration_points' && <RegistrationPoints initialTab="main" onNavigate={setCurrentView} />}
          {currentView === 'registration_points_stats' && <RegistrationPoints initialTab="stats" onNavigate={setCurrentView} />}

          {/* Expiration Reminder View */}
          {currentView === 'expiration_reminder' && <ExpirationReminder onNavigate={setCurrentView} />}

          {/* Referral Settings View */}
          {currentView === 'referral_settings' && <ReferralSettings onNavigate={setCurrentView} />}
          
          {/* Operations Log */}
          {currentView === 'operations_log' && <OperationsLog onClientClick={navigateToClient} />}
        </main>
      </div>
    </div>
  );
};

export default App;