export interface ClaudeResponse {
  success: boolean;
  content: string;
  error?: string;
}

export interface Compartment {
  name: string;
  description: string;
  writeConfirmation: boolean;
}

export const COMPARTMENTS: Record<string, Compartment> = {
  personal: {
    name: 'personal',
    description: 'Identity, family, scheduling preferences, important dates',
    writeConfirmation: false,
  },
  finance: {
    name: 'finance',
    description: 'Budget, subscriptions, financial goals',
    writeConfirmation: true,
  },
  health: {
    name: 'health',
    description: 'Providers, medications, health goals',
    writeConfirmation: false,
  },
  travel: {
    name: 'travel',
    description: 'Loyalty programs, trips, packing lists',
    writeConfirmation: false,
  },
  builds: {
    name: 'builds',
    description: 'Bounded projects with codebases - strategic context and backlog',
    writeConfirmation: false,
  },
  brand: {
    name: 'brand',
    description: 'Lavistique DTC business - metrics, marketing, creative',
    writeConfirmation: false,
  },
  career: {
    name: 'career',
    description: 'Job search - resume, narrative, applications',
    writeConfirmation: true,
  },
};

export interface Reminder {
  id: string;
  message: string;
  cron: string;
  enabled: boolean;
  createdAt: string;
}
