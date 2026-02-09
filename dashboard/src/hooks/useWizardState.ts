import { useCallback, useMemo, useState } from "react";
import { DB_DRIVERS, getDriverById } from "../lib/db-drivers/DriverRegistry";
import { DbDriverDescriptor, DriverPropertyDescriptor } from "../lib/db-drivers/types";
import {
  ConnectionFormState,
  SSHTunnelConfig,
  ProxyConfig,
  SSLConfig,
  AdvancedProperty,
  AdvancedPropertiesState,
  ConnectionPayload,
} from "../types/connection";

export type WizardStepId =
  | "driver"
  | "basic"
  | "network"
  | "ssl"
  | "advanced"
  | "review";

interface WizardState {
  stepIndex: number;
  selectedDriverId: string;
  basicSettings: ConnectionFormState;
  sshConfig: SSHTunnelConfig;
  proxyConfig: ProxyConfig;
  sslConfig: SSLConfig;
  advancedProperties: AdvancedPropertiesState;
}

const DEFAULT_DRIVER = DB_DRIVERS[0];

const DEFAULT_FORM: ConnectionFormState = {
  host: DEFAULT_DRIVER.defaultTemplate.host,
  port: DEFAULT_DRIVER.defaultTemplate.port,
  database: DEFAULT_DRIVER.defaultTemplate.database || "",
  user: DEFAULT_DRIVER.defaultTemplate.user || "",
  password: DEFAULT_DRIVER.defaultTemplate.password || "",
};

const DEFAULT_SSH: SSHTunnelConfig = {
  enabled: false,
  host: "",
  port: 22,
  username: "",
  authMethod: "password",
  password: "",
  privateKeyPath: "",
  passphrase: "",
  localPort: 54320,
  remoteHost: DEFAULT_FORM.host,
  remotePort: DEFAULT_FORM.port,
};

const DEFAULT_PROXY: ProxyConfig = {
  enabled: false,
  type: "http",
  host: "",
  port: 8080,
  username: "",
  password: "",
};

const DEFAULT_SSL: SSLConfig = {
  enabled: false,
  trustStorePath: "",
  trustStorePassword: "",
  keyStorePath: "",
  keyStorePassword: "",
  validateServerCertificate: true,
  clientCertificatePath: "",
};

const randomId = () => Math.random().toString(36).slice(2, 9);

const buildDriverProperty = (descriptor: DriverPropertyDescriptor): AdvancedProperty => ({
  id: descriptor.id,
  key: descriptor.key,
  value: descriptor.defaultValue ?? "",
  label: descriptor.label,
  description: descriptor.description,
  type: descriptor.type,
  required: descriptor.required,
  options: descriptor.options,
  validationRegex: descriptor.validationRegex,
  validationMessage: descriptor.validationMessage,
  placeholder: descriptor.placeholder,
  source: "driver",
});

const composeAdvancedProperties = (
  driver: DbDriverDescriptor,
  options?: {
    values?: Record<string, string>;
    custom?: AdvancedProperty[];
  }
): AdvancedPropertiesState => {
  const values = options?.values ?? {};
  const driverProps = (driver.connectionProperties ?? []).map((descriptor) => {
    const base = buildDriverProperty(descriptor);
    return {
      ...base,
      value: values[descriptor.key] ?? base.value,
    };
  });

  const driverKeys = new Set(driverProps.map((prop) => prop.key));

  const preservedCustom = (options?.custom ?? []).filter((prop) => !driverKeys.has(prop.key));

  const presetOnlyKeys = Object.entries(values)
    .filter(([key]) => !driverKeys.has(key));

  const presetCustomProps: AdvancedProperty[] = presetOnlyKeys.map(([key, value]) => ({
    id: `custom-${key}-${randomId()}`,
    key,
    value,
    source: "custom",
  }));

  return {
    properties: [...driverProps, ...preservedCustom, ...presetCustomProps],
  };
};

export const WIZARD_STEPS: { id: WizardStepId; label: string }[] = [
  { id: "driver", label: "Driver" },
  { id: "basic", label: "Connection" },
  { id: "network", label: "Network" },
  { id: "ssl", label: "SSL" },
  { id: "advanced", label: "Properties" },
  { id: "review", label: "Test & Save" },
];

export function useWizardState(initialStep = 0) {
  const [state, setState] = useState<WizardState>({
    stepIndex: initialStep,
    selectedDriverId: DEFAULT_DRIVER.id,
    basicSettings: DEFAULT_FORM,
    sshConfig: DEFAULT_SSH,
    proxyConfig: DEFAULT_PROXY,
    sslConfig: DEFAULT_SSL,
    advancedProperties: composeAdvancedProperties(DEFAULT_DRIVER),
  });

  const selectedDriver: DbDriverDescriptor = useMemo(() => {
    return getDriverById(state.selectedDriverId);
  }, [state.selectedDriverId]);

  const updateBasicSettings = useCallback((updates: Partial<ConnectionFormState>) => {
    setState((prev) => ({
      ...prev,
      basicSettings: {
        ...prev.basicSettings,
        ...updates,
      },
    }));
  }, []);

  const updateSSHConfig = useCallback((updates: Partial<SSHTunnelConfig>) => {
    setState((prev) => ({
      ...prev,
      sshConfig: {
        ...prev.sshConfig,
        ...updates,
      },
    }));
  }, []);

  const updateProxyConfig = useCallback((updates: Partial<ProxyConfig>) => {
    setState((prev) => ({
      ...prev,
      proxyConfig: {
        ...prev.proxyConfig,
        ...updates,
      },
    }));
  }, []);

  const updateSSLConfig = useCallback((updates: Partial<SSLConfig>) => {
    setState((prev) => ({
      ...prev,
      sslConfig: {
        ...prev.sslConfig,
        ...updates,
      },
    }));
  }, []);

  const addAdvancedProperty = useCallback(() => {
    setState((prev) => ({
      ...prev,
      advancedProperties: {
        properties: [
          ...prev.advancedProperties.properties,
          { id: `custom-${randomId()}`, key: "", value: "", source: "custom" },
        ],
      },
    }));
  }, []);

  const updateAdvancedProperty = useCallback((id: string, updates: Partial<AdvancedProperty>) => {
    setState((prev) => ({
      ...prev,
      advancedProperties: {
        properties: prev.advancedProperties.properties.map((prop) =>
          prop.id === id ? { ...prop, ...updates } : prop
        ),
      },
    }));
  }, []);

  const removeAdvancedProperty = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      advancedProperties: {
        properties: prev.advancedProperties.properties.filter((prop) => prop.id !== id),
      },
    }));
  }, []);

  const setSelectedDriver = useCallback((driverId: string) => {
    const descriptor = getDriverById(driverId);
    setState((prev) => {
      const customProps = prev.advancedProperties.properties.filter((prop) => prop.source === "custom");
      return {
        ...prev,
        selectedDriverId: driverId,
        basicSettings: {
          host: descriptor.defaultTemplate.host,
          port: descriptor.defaultTemplate.port,
          database: descriptor.defaultTemplate.database || "",
          user: descriptor.defaultTemplate.user || "",
          password: descriptor.defaultTemplate.password || "",
        },
        sshConfig: {
          ...prev.sshConfig,
          remoteHost: descriptor.defaultTemplate.host,
          remotePort: descriptor.defaultTemplate.port,
        },
        advancedProperties: composeAdvancedProperties(descriptor, { custom: customProps }),
      };
    });
  }, []);

  const applyPreset = useCallback((driverId: string, payload: ConnectionPayload) => {
    const descriptor = getDriverById(driverId);
    setState((prev) => ({
      ...prev,
      selectedDriverId: driverId,
      basicSettings: {
        host: payload.host,
        port: payload.port,
        database: payload.database,
        user: payload.user,
        password: payload.password,
      },
      sshConfig: {
        ...DEFAULT_SSH,
        ...payload.ssh,
      },
      proxyConfig: {
        ...DEFAULT_PROXY,
        ...payload.proxy,
      },
      sslConfig: {
        ...DEFAULT_SSL,
        ...payload.ssl,
      },
      advancedProperties: composeAdvancedProperties(descriptor, {
        values: payload.properties,
      }),
    }));
  }, []);

  const nextStep = useCallback(() => {
    setState((prev) => ({
      ...prev,
      stepIndex: Math.min(prev.stepIndex + 1, WIZARD_STEPS.length - 1),
    }));
  }, []);

  const prevStep = useCallback(() => {
    setState((prev) => ({
      ...prev,
      stepIndex: Math.max(prev.stepIndex - 1, 0),
    }));
  }, []);

  const goToStep = useCallback((index: number) => {
    setState((prev) => ({
      ...prev,
      stepIndex: Math.max(0, Math.min(index, WIZARD_STEPS.length - 1)),
    }));
  }, []);

  const reset = useCallback(() => {
    setState({
      stepIndex: 0,
      selectedDriverId: DEFAULT_DRIVER.id,
      basicSettings: DEFAULT_FORM,
      sshConfig: DEFAULT_SSH,
      proxyConfig: DEFAULT_PROXY,
      sslConfig: DEFAULT_SSL,
      advancedProperties: composeAdvancedProperties(DEFAULT_DRIVER),
    });
  }, []);

  const currentStep: WizardStepId = WIZARD_STEPS[state.stepIndex]?.id ?? "driver";

  const canProceed = useMemo(() => {
    switch (currentStep) {
      case "driver":
        return !!state.selectedDriverId;
      case "basic":
        return !!state.basicSettings.host && state.basicSettings.port > 0;
      default:
        return true;
    }
  }, [currentStep, state.selectedDriverId, state.basicSettings]);

  const isDriverConnectable = useCallback((driver?: DbDriverDescriptor) => {
    const d = driver ?? selectedDriver;
    return d?.connectivity?.status === "available" || d?.connectivity?.status === "preview";
  }, [selectedDriver]);

  return {
    stepIndex: state.stepIndex,
    currentStep,
    selectedDriver,
    selectedDriverId: state.selectedDriverId,
    basicSettings: state.basicSettings,
    sshConfig: state.sshConfig,
    proxyConfig: state.proxyConfig,
    sslConfig: state.sslConfig,
    advancedProperties: state.advancedProperties,
    canProceed,
    updateBasicSettings,
    updateSSHConfig,
    updateProxyConfig,
    updateSSLConfig,
    addAdvancedProperty,
    updateAdvancedProperty,
    removeAdvancedProperty,
    setSelectedDriver,
    isDriverConnectable,
    applyPreset,
    nextStep,
    prevStep,
    goToStep,
    reset,
  };
}
