'use client';

import React, { type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface StepDef {
  label: string;
  description?: string;
}

interface StepWizardProps {
  steps: StepDef[];
  currentStep: number;
  onStepChange: (step: number) => void;
  onComplete: () => void;
  canAdvance?: boolean;
  canGoBack?: boolean;
  completeLabel?: string;
  children: ReactNode;
}

export function StepWizard({
  steps,
  currentStep,
  onStepChange,
  onComplete,
  canAdvance = true,
  canGoBack = true,
  completeLabel = 'Finalizar Remessa',
  children,
}: StepWizardProps) {
  const isLastStep = currentStep === steps.length - 1;

  return (
    <div className="flex gap-6">
      {/* Left sidebar - Step list */}
      <nav className="w-64 flex-shrink-0">
        <ol className="space-y-2">
          {steps.map((step, index) => {
            const isCompleted = index < currentStep;
            const isActive = index === currentStep;
            const isFuture = index > currentStep;

            return (
              <li key={index}>
                <button
                  type="button"
                  className={cn(
                    'flex w-full items-start gap-3 rounded-lg px-3 py-3 text-left transition-colors',
                    isActive && 'bg-muted',
                    !isActive && !isFuture && 'hover:bg-muted/50',
                    isFuture && 'opacity-60'
                  )}
                  onClick={() => {
                    if (isCompleted && canGoBack) {
                      onStepChange(index);
                    }
                  }}
                  disabled={isFuture}
                >
                  {/* Step number circle */}
                  <span
                    className={cn(
                      'flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                      isCompleted && 'bg-green-600 text-white',
                      isActive && 'bg-primary text-primary-foreground',
                      isFuture && 'bg-muted-foreground/20 text-muted-foreground'
                    )}
                  >
                    {isCompleted ? (
                      <svg
                        className="h-4 w-4"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={2.5}
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M4.5 12.75l6 6 9-13.5"
                        />
                      </svg>
                    ) : (
                      index + 1
                    )}
                  </span>

                  {/* Step label and description */}
                  <div className="min-w-0">
                    <p
                      className={cn(
                        'text-sm font-medium',
                        isFuture && 'text-muted-foreground'
                      )}
                    >
                      {step.label}
                    </p>
                    {step.description && (
                      <p className="mt-0.5 text-xs text-muted-foreground truncate">
                        {step.description}
                      </p>
                    )}
                  </div>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      {/* Right area - Content + navigation */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Step content */}
        <div className="flex-1">{children}</div>

        {/* Bottom navigation */}
        <div className="mt-6 flex items-center justify-between border-t pt-4">
          <Button
            variant="outline"
            onClick={() => onStepChange(currentStep - 1)}
            disabled={currentStep === 0 || !canGoBack}
          >
            Voltar
          </Button>

          {isLastStep ? (
            <Button onClick={onComplete} disabled={!canAdvance}>
              {completeLabel}
            </Button>
          ) : (
            <Button
              onClick={() => onStepChange(currentStep + 1)}
              disabled={!canAdvance}
            >
              Proximo Passo
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
