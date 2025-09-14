"use client";

import { useEffect, useState } from "react";
import { createReferralProgram, getActiveReferralProgram, updateReferralProgram, type ReferralProgramDto } from "../../../lib/admin";

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean)=>void; label?: string }) {
  return (
    <label className="inline-flex items-center gap-2 cursor-pointer select-none">
      <span className="text-sm text-[#9fb0c9]">{label}</span>
      <span onClick={() => onChange(!checked)} className={`w-10 h-6 rounded-full transition-colors ${checked? 'bg-emerald-500' : 'bg-[#1e2a44]'} relative`}>
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${checked? 'translate-x-4' : ''}`} />
      </span>
    </label>
  );
}

export default function ReferralSettingsPage() {
  const [merchantId, setMerchantId] = useState<string>(process.env.NEXT_PUBLIC_MERCHANT_ID || "M-1");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [program, setProgram] = useState<any | null>(null);

  // UI-only options (часть пока не поддерживается backend)
  const [rewardScopeAll, setRewardScopeAll] = useState<boolean>(false); // За все покупки друга
  const [rewardTypePercent, setRewardTypePercent] = useState<boolean>(false); // Процент от суммы
  const [multiLevel, setMultiLevel] = useState<boolean>(false);
  const [levels, setLevels] = useState<Array<{ level: number; value: number }>>([{ level: 1, value: 100 }]);
  const [sumWithRegistration, setSumWithRegistration] = useState<boolean>(false);

  const [referrerReward, setReferrerReward] = useState<number>(100);
  const [refereeReward, setRefereeReward] = useState<number>(100);

  const load = async () => {
    setBusy(true); setError(null); setMsg(null);
    try {
      const p = await getActiveReferralProgram(merchantId).catch(()=>null);
      setProgram(p);
      if (p) {
        setReferrerReward(p.referrerReward || 0);
        setRefereeReward(p.refereeReward || 0);
      }
    } catch (e: any) { setError(e?.message || String(e)); }
    finally { setBusy(false); }
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    setBusy(true); setError(null); setMsg(null);
    try {
      const payload: ReferralProgramDto = {
        merchantId,
        name: program?.name || 'Реферальная программа',
        description: program?.description || 'Реферальная программа лояльности',
        referrerReward,
        refereeReward,
        status: program?.status || 'ACTIVE',
        minPurchaseAmount: program?.minPurchaseAmount || 0,
        maxReferrals: program?.maxReferrals || 100,
        expiryDays: program?.expiryDays || 30,
      };
      if (program?.id) await updateReferralProgram(program.id, payload); else await createReferralProgram(payload);
      setMsg('Сохранено');
      await load();
    } catch (e: any) { setError(e?.message || String(e)); }
    finally { setBusy(false); }
  };

  const toggleStatus = async () => {
    if (!program) return;
    setBusy(true); setError(null); setMsg(null);
    try {
      await updateReferralProgram(program.id, { status: program.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE' });
      setMsg(program.status === 'ACTIVE' ? 'Программа приостановлена' : 'Программа активирована');
      await load();
    } catch (e: any) { setError(e?.message || String(e)); }
    finally { setBusy(false); }
  };

  const addLevel = () => {
    setLevels(prev => [...prev, { level: prev.length + 1, value: 0 }]);
  };
  const removeLevel = () => {
    setLevels(prev => prev.length > 1 ? prev.slice(0, -1) : prev);
  };

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-end gap-3 flex-wrap">
        <div>
          <label className="block text-xs text-[#7f8ea3]">merchantId</label>
          <input className="border border-[#1e2a44] bg-[#0e1629] rounded p-2" value={merchantId} onChange={e=>setMerchantId(e.target.value)} />
        </div>
        <button onClick={load} disabled={busy} className="px-4 py-2 bg-blue-600 rounded text-white disabled:opacity-60">{busy? 'Загрузка...' : 'Обновить'}</button>
        {error && <div className="text-rose-400 text-sm">{error}</div>}
        {msg && <div className="text-emerald-400 text-sm">{msg}</div>}
      </div>

      <div className="rounded-xl border border-[#1e2a44] bg-[#0e1629] p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-lg font-semibold">Настройки реферальной программы</div>
            <div className="text-xs text-[#7f8ea3]">Часть опций (процент/многоуровневая система/суммирование) пока требует расширения backend и отображается как неактивная.</div>
          </div>
          <Toggle checked={program?.status === 'ACTIVE'} onChange={toggleStatus} label={program?.status === 'ACTIVE' ? 'Включена' : 'Выключена'} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <div className="text-sm font-medium">За что поощрять?</div>
            <div className="flex gap-2">
              <button className={`px-3 py-2 rounded border ${!rewardScopeAll? 'bg-emerald-600 border-emerald-600' : 'border-[#1e2a44]'}`} onClick={()=>setRewardScopeAll(false)}>За первую покупку друга</button>
              <button className={`px-3 py-2 rounded border ${rewardScopeAll? 'bg-emerald-600 border-emerald-600' : 'border-[#1e2a44]'}`} onClick={()=>setRewardScopeAll(true)} disabled title="Требуется доработка backend">За все покупки друга</button>
            </div>
          </div>

          <div className="space-y-3">
            <div className="text-sm font-medium">Тип поощрения</div>
            <div className="flex gap-2">
              <button className={`px-3 py-2 rounded border ${!rewardTypePercent? 'bg-emerald-600 border-emerald-600' : 'border-[#1e2a44]'}`} onClick={()=>setRewardTypePercent(false)}>Фикс. баллы</button>
              <button className={`px-3 py-2 rounded border ${rewardTypePercent? 'bg-emerald-600 border-emerald-600' : 'border-[#1e2a44]'}`} onClick={()=>setRewardTypePercent(true)} disabled title="Требуется доработка backend">% от суммы</button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="block text-xs text-[#7f8ea3]">Приглашающий: баллы</label>
            <input type="number" className="border border-[#1e2a44] bg-[#0e1629] rounded p-2" value={referrerReward} onChange={e=>setReferrerReward(parseInt(e.target.value||'0',10)||0)} />
          </div>
          <div className="space-y-2">
            <label className="block text-xs text-[#7f8ea3]">Друг: баллы</label>
            <div className="flex items-center gap-2">
              <input type="number" className="border border-[#1e2a44] bg-[#0e1629] rounded p-2" value={refereeReward} onChange={e=>setRefereeReward(parseInt(e.target.value||'0',10)||0)} />
              <span className="text-xs text-[#7f8ea3]">баллов</span>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <Toggle checked={multiLevel} onChange={setMultiLevel} label="Многоуровневая система" />
          <div className={`rounded border border-dashed ${multiLevel? 'border-[#1e2a44]' : 'border-[#24314d] opacity-60 pointer-events-none'}`}>
            <div className="p-3 grid gap-3">
              {levels.map((lvl, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <div className="text-sm text-[#9fb0c9] w-20">{lvl.level} уровень</div>
                  <input type="number" className="border border-[#1e2a44] bg-[#0e1629] rounded p-2 w-32" value={lvl.value} onChange={e=>{
                    const v = parseInt(e.target.value||'0',10)||0; setLevels(prev=>prev.map((p,i)=> i===idx? {...p, value: v} : p));
                  }} />
                  <span className="text-xs text-[#7f8ea3]">{rewardTypePercent? '% от суммы' : 'баллов'}</span>
                </div>
              ))}
              <div className="flex gap-2">
                <button onClick={addLevel} className="px-2 py-1 border border-[#1e2a44] rounded">Добавить уровень</button>
                <button onClick={removeLevel} className="px-2 py-1 border border-[#1e2a44] rounded">Удалить уровень</button>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Toggle checked={sumWithRegistration} onChange={setSumWithRegistration} label="Суммировать баллы по реферальной программе и за регистрацию" />
        </div>

        <div className="pt-2">
          <button onClick={save} disabled={busy} className="px-4 py-2 bg-emerald-600 rounded text-white disabled:opacity-60">Сохранить</button>
        </div>
      </div>
    </div>
  );
}
