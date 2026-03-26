'use client';

import React, { type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

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
  /** URL to navigate to when pressing Voltar on the first step. Defaults to browser back. */
  exitUrl?: string;
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
  exitUrl,
  children,
}: StepWizardProps) {
  const router = useRouter();
  const isLastStep = currentStep === steps.length - 1;

  const handleBack = () => {
    if (currentStep > 0) {
      onStepChange(currentStep - 1);
    } else if (exitUrl) {
      router.push(exitUrl);
    } else {
      router.back();
    }
  };

  return (
    <div className="flex flex-col min-w-0">
      {/* Step content */}
      <div className="flex-1">{children}</div>

      {/* Bottom navigation */}
      <div className="mt-6 flex items-center justify-between border-t pt-4">
        <Button
          variant="outline"
          onClick={handleBack}
          disabled={currentStep > 0 && !canGoBack}
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
  );
}
