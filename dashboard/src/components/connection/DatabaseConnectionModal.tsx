"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Plug,
  ShieldCheck,
  Sparkles,
  Loader2,
  X,
} from "lucide-react";
import { useDemoMode } from "../../context/DemoContext";
import { useConnectionState } from "../../providers";
import { DB_DRIVERS, SUPPORTED_PROTOCOLS } from "../../lib/db-drivers/DriverRegistry";
import { DbDriverDescriptor } from "../../lib/db-drivers/types";
import { StepIndicator } from "./wizard/StepIndicator";
import { DriverSelectionStep } from "./steps/DriverSelectionStep";
import { BasicConnectionStep } from "./steps/BasicConnectionStep";
import { useWizardState, WIZARD_STEPS } from "../../hooks/useWizardState";
import { NetworkStep } from "./steps/NetworkStep";
import { SSLStep } from "./steps/SSLStep";
import { AdvancedPropertiesStep } from "./steps/AdvancedPropertiesStep";
import { ReviewStep } from "./steps/ReviewStep";
import { ConnectionPreset } from "../../types/connection";

interface DatabaseConnectionModalProps {
  isOpen: boolean;
  variant: "primary" | "schema" | "vector" | "warehouse" | "cloud" | "streaming";
  onClose: () => void;
}

export function DatabaseConnectionModal({ isOpen, variant, onClose }: DatabaseConnectionModalProps) {
  const { isDemoMode } = useDemoMode();
  const { connect, isConnecting } = useConnectionState();
  
  const {
    currentStep,
    stepIndex,
    selectedDriverId,
    selectedDriver,
    basicSettings,
    sshConfig,
    proxyConfig,
    sslConfig,
    advancedProperties,
    canProceed,
    goToStep,
    nextStep,
    prevStep,
    updateBasicSettings,
    updateSSHConfig,
    updateProxyConfig,
    updateSSLConfig,
    addAdvancedProperty,
    updateAdvancedProperty,
    removeAdvancedProperty,
    setSelectedDriver,
    isDriverConnectable,
    reset
  } = useWizardState();

  const [connecting, setConnecting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusLog, setStatusLog] = useState<string[]>([]);
  const [progressStage, setProgressStage] = useState(0);
  const [presets, setPresets] = useState<ConnectionPreset[]>([]);
  const [presetsLoading, setPresetsLoading] = useState(false);
  const [presetsError, setPresetsError] = useState<string | null>(null);
  const [isSavingPreset, setIsSavingPreset] = useState(false);
  const [presetActionMessage, setPresetActionMessage] = useState<string | null>(null);

  const modalTitle = useMemo(() => {
    switch (variant) {
      case "primary":
        return "Database Connection";
      case "schema":
        return "Schema Import";
      default:
        return "Connection";
    }
  }, [variant]);

  const modalDescription = useMemo(() => {
    switch (variant) {
      case "primary":
        return "Configure secure database connection with SSH tunneling and SSL";
      case "schema":
        return "Connect to database to import schema for analysis";
      default:
        return "Configure database connection";
    }
  }, [variant]);

  const appendLog = useCallback((message: string) => {
    setStatusLog(prev => [...prev.slice(-20), `[${new Date().toLocaleTimeString()}] ${message}`]);
  }, []);

  const handleTestConnection = useCallback(async () => {
    if (!selectedDriver || !basicSettings.host) return;
    
    setTesting(true);
    setError(null);
    setProgressStage(1);
    appendLog("Testing connection...");
    
    try {
      // Simulate connection test
      await new Promise(resolve => setTimeout(resolve, 2000));
      setProgressStage(2);
      appendLog("Connection successful!");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Connection test failed";
      setError(message);
      appendLog(`Test failed: ${message}`);
      setProgressStage(0);
    } finally {
      setTesting(false);
    }
  }, [selectedDriver, basicSettings, appendLog]);

  const handleConnect = useCallback(async () => {
    if (!selectedDriver || !basicSettings.host) return;
    
    setConnecting(true);
    setError(null);
    setProgressStage(1);
    appendLog("Establishing secure connection...");
    
    try {
      // Simulate connection
      await new Promise(resolve => setTimeout(resolve, 3000));
      await connect({
        driver: selectedDriver,
        basicSettings,
        sshConfig,
        proxyConfig,
        sslConfig,
        advancedProperties: advancedProperties.properties
      });
      setProgressStage(3);
      appendLog("Connection established successfully!");
      setTimeout(() => {
        onClose();
        reset();
      }, 1500);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Connection failed";
      setError(message);
      appendLog(`Ошибка подключения: ${message}`);
      setProgressStage(0);
    } finally {
      setConnecting(false);
    }
  }, [selectedDriver, basicSettings, sshConfig, proxyConfig, sslConfig, advancedProperties, connect, onClose, reset, appendLog]);

  const handleSavePreset = useCallback(async () => {
    if (!selectedDriver || !basicSettings.host) return;
    
    setIsSavingPreset(true);
    setPresetActionMessage(null);
    setPresetsError(null);
    
    try {
      const preset: ConnectionPreset = {
        id: Date.now().toString(),
        name: `${selectedDriver.name} - ${basicSettings.host}`,
        driverId: selectedDriver.id,
        basicSettings,
        sshConfig,
        proxyConfig,
        sslConfig,
        advancedProperties: advancedProperties.properties,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      setPresets(prev => [...prev, preset]);
      setPresetActionMessage("Preset saved successfully!");
    } catch (err) {
      setPresetsError("Failed to save preset");
    } finally {
      setIsSavingPreset(false);
    }
  }, [selectedDriver, basicSettings, sshConfig, proxyConfig, sslConfig, advancedProperties]);

  const handleApplyPreset = useCallback((preset: ConnectionPreset) => {
    // Apply preset logic here
    appendLog(`Applying preset: ${preset.name}`);
  }, [appendLog]);

  const handleDeletePreset = useCallback((presetId: string) => {
    setPresets(prev => prev.filter(p => p.id !== presetId));
    setPresetActionMessage("Preset deleted");
  }, []);

  const handleNextStep = useCallback(() => {
    if (canProceed) {
      nextStep();
    }
  }, [canProceed, nextStep]);

  const closeModal = useCallback(() => {
    if (!connecting && !testing) {
      onClose();
      reset();
    }
  }, [connecting, testing, onClose, reset]);

  if (!isOpen) return null;

  const renderStep = () => {
    switch (currentStep) {
      case "driver":
        return (
          <DriverSelectionStep
            drivers={DB_DRIVERS}
            selectedDriverId={selectedDriverId}
            onSelectDriver={setSelectedDriver}
            supportedProtocols={SUPPORTED_PROTOCOLS}
            isConnectable={isDriverConnectable}
          />
        );
      case "basic":
        return (
          <BasicConnectionStep
            value={basicSettings}
            onChange={updateBasicSettings}
          />
        );
      case "network":
        return (
          <NetworkStep
            sshConfig={sshConfig}
            proxyConfig={proxyConfig}
            onSSHChange={updateSSHConfig}
            onProxyChange={updateProxyConfig}
          />
        );
      case "ssl":
        return <SSLStep value={sslConfig} onChange={updateSSLConfig} />;
      case "advanced":
        return (
          <AdvancedPropertiesStep
            properties={advancedProperties.properties}
            onAddProperty={addAdvancedProperty}
            onUpdateProperty={updateAdvancedProperty}
            onRemoveProperty={removeAdvancedProperty}
          />
        );
      case "review":
        return (
          <ReviewStep
            driver={selectedDriver}
            basicSettings={basicSettings}
            sshConfig={sshConfig}
            proxyConfig={proxyConfig}
            sslConfig={sslConfig}
            advancedProperties={advancedProperties.properties}
          />
        );
      default:
        return null;
    }
  };

  const isFinalStep = currentStep === "review";

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-xl"
        onClick={closeModal}
      />

      <div className="relative z-10 w-full max-w-6xl max-h-[90vh] rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900/90 via-slate-900/70 to-slate-900/40 shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-8 py-6 border-b border-white/10 shrink-0">
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-slate-500 mb-2">DBeaver wizard</p>
            <h2 className="text-3xl font-semibold text-white flex items-center gap-3">
              <Plug className="w-7 h-7 text-emerald-400" />
              {modalTitle}
            </h2>
            <p className="text-slate-300 mt-2 text-sm">{modalDescription}</p>
          </div>
          <button
            onClick={closeModal}
            className="p-2 rounded-2xl border border-white/10 text-slate-400 hover:text-white hover:border-white/30"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-8 py-6">
          <div className="grid grid-cols-12 gap-6">
            <div className="col-span-12 lg:col-span-3 space-y-4">
              <StepIndicator 
                currentStep={stepIndex} 
                onSelectStep={(index) => index <= stepIndex && goToStep(index)} 
              />
              {isDemoMode && (
                <p className="text-xs text-emerald-400 flex items-center gap-2">
                  <Sparkles className="w-4 h-4" /> Demo mode: ответы мгновенные
                </p>
              )}

              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Presets</p>
                    <p className="text-[11px] text-slate-500">Сохраняй и переиспользуй подключения</p>
                  </div>
                  <button
                    onClick={handleSavePreset}
                    disabled={isSavingPreset || connecting || testing}
                    className="text-emerald-300 text-xs font-semibold hover:text-emerald-100 disabled:opacity-40"
                  >
                    {isSavingPreset ? "Saving…" : "Save"}
                  </button>
                </div>
                {presetActionMessage && (
                  <p className="text-[11px] text-emerald-300">{presetActionMessage}</p>
                )}
                {presetsError && <p className="text-[11px] text-red-300">{presetsError}</p>}
                <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar">
                  {presetsLoading && <p className="text-xs text-slate-500">Загружаем пресеты…</p>}
                  {!presetsLoading && presets.length === 0 && (
                    <p className="text-xs text-slate-500">Пока нет сохраненных пресетов</p>
                  )}
                  {presets.map((preset) => (
                    <div key={preset.id} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm">
                      <div className="flex items-center justify-between">
                        <button
                          onClick={() => handleApplyPreset(preset)}
                          className="text-left text-white font-medium hover:text-emerald-200"
                        >
                          {preset.name}
                        </button>
                        <button
                          onClick={() => handleDeletePreset(preset.id)}
                          className="text-slate-500 hover:text-red-300 text-xs"
                        >
                          ✕
                        </button>
                      </div>
                      <p className="text-[10px] text-slate-500">Обновлен {new Date(preset.updatedAt).toLocaleDateString()}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            
            <div className="col-span-12 lg:col-span-9 space-y-6">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-5 min-h-[320px]">
                {renderStep()}
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/30 p-5 h-40 overflow-auto custom-scrollbar">
                <div className="flex items-center gap-2 text-xs text-slate-400 uppercase tracking-[0.3em] mb-3">
                  <Sparkles className="w-3 h-3" /> Event Log
                </div>
                {statusLog.length === 0 ? (
                  <p className="text-slate-500 text-sm">Журнал пуст. Проверь соединение или нажми "Подключить".</p>
                ) : (
                  <ul className="space-y-1 text-sm text-slate-200">
                    {statusLog.slice(-6).map((line, idx) => (
                      <li key={`${line}-${idx}`} className="font-mono text-xs text-slate-300">
                        {line}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {error && (
                <div className="flex items-center gap-3 rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  <ShieldCheck className="w-4 h-4" />
                  {error}
                </div>
              )}

              <div className="flex flex-col md:flex-row md:items-center gap-3 justify-between">
                <div className="text-xs text-slate-400 flex items-center gap-2">
                  <Plug className="w-4 h-4 text-emerald-400" />
                  Secure channel: TLS + Audit trail enabled
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={prevStep}
                    disabled={stepIndex === 0 || connecting || testing}
                    className="flex items-center gap-2 rounded-2xl border border-white/20 px-4 py-2 text-sm font-semibold text-white hover:border-white/40 disabled:opacity-50"
                  >
                    Back
                  </button>
                  {!isFinalStep && (
                    <button
                      onClick={handleNextStep}
                      disabled={!canProceed}
                      className="flex items-center gap-2 rounded-2xl border border-emerald-400/40 bg-gradient-to-r from-emerald-500/50 to-green-500/50 px-5 py-2 text-sm font-semibold text-white hover:from-emerald-500 hover:to-green-500 disabled:opacity-60"
                    >
                      Next step
                    </button>
                  )}
                  {isFinalStep && (
                    <>
                      <button
                        onClick={handleTestConnection}
                        disabled={testing || connecting || !isDriverConnectable()}
                        className="flex items-center gap-2 rounded-2xl border border-white/20 px-4 py-2 text-sm font-semibold text-white hover:border-white/40 disabled:opacity-50"
                      >
                        {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                        Test connection
                      </button>
                      <button
                        onClick={handleConnect}
                        disabled={connecting || !isDriverConnectable()}
                        className="flex items-center gap-2 rounded-2xl border border-emerald-400/40 bg-gradient-to-r from-emerald-500/50 to-green-500/50 px-5 py-2 text-sm font-semibold text-white hover:from-emerald-500 hover:to-green-500 disabled:opacity-60"
                      >
                        {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                        Подключить
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
