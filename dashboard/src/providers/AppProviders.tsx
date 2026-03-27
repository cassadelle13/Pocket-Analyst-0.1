"use client";

import type { ReactNode } from "react";
import { Fragment } from 'react';

import { Refine } from "@refinedev/core";
import routerProvider from "@refinedev/nextjs-router";
import simpleRestProvider from "@refinedev/simple-rest";

import { RoleProvider } from "./RoleProvider";
import { JitsuProvider } from "./JitsuProvider";
import { LanguageProvider } from "./LanguageProvider";
import { DemoProvider } from "../context/DemoContext";
import { GraphicsProvider } from "../context/GraphicsContext";
import { ConnectionStateProvider } from "./ConnectionStateProvider";
import { ChartInteractionProvider } from "../context/ChartInteractionBus";
import { ChartSyncSettingsProvider } from "../context/ChartSyncSettings";
import { ChartClickBehaviorProvider } from "../context/ChartClickBehavior";
import { GlobalFiltersProvider } from "@/store/globalFiltersContext";
import { BiFiltersProvider } from "@/store/biFiltersContext";
import { ChartExplainModal } from "@/components/charts/ChartExplainModal";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <Fragment>
      <LanguageProvider>
        <ConnectionStateProvider>
          <RoleProvider>
            <GraphicsProvider>
              <DemoProvider>
                <Refine
                  routerProvider={routerProvider}
                  dataProvider={simpleRestProvider("/api/rest")}
                  resources={[
                    { name: "events" },
                    { name: "top-events" },
                    { name: "traffic-breakdown" },
                    { name: "activity" },
                    { name: "funnel" },
                    { name: "cyber-funnel" },
                    { name: "tables" },
                    { name: "health" },
                    { name: "vector-health" },
                    { name: "events-table" },
                  ]}
                  options={{ warnWhenUnsavedChanges: false, syncWithLocation: false }}
                >
                  <JitsuProvider>
                    <ChartSyncSettingsProvider>
                      <ChartClickBehaviorProvider>
                        <ChartInteractionProvider>
                          <GlobalFiltersProvider>
                            <BiFiltersProvider>
                              {children}
                            </BiFiltersProvider>
                          </GlobalFiltersProvider>
                        </ChartInteractionProvider>
                      </ChartClickBehaviorProvider>
                    </ChartSyncSettingsProvider>
                  </JitsuProvider>
                </Refine>
              </DemoProvider>
            </GraphicsProvider>
          </RoleProvider>
        </ConnectionStateProvider>
      </LanguageProvider>
      <ChartExplainModal />
    </Fragment>
  );
}
