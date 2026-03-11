import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { babiesRepo } from '@/services/repositories/babiesRepo';

type CurrentBabyContextValue = {
  currentBabyId: string | null;
  setCurrentBabyId: (id: string | null) => void;
  /** True after we've attempted to restore the selected baby from storage (so tabs can safely default to first baby if needed). */
  isHydrated: boolean;
};

const CurrentBabyContext = createContext<CurrentBabyContextValue | null>(null);

export function CurrentBabyProvider({ children }: { children: React.ReactNode }) {
  const [currentBabyId, setCurrentBabyIdState] = useState<string | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    babiesRepo.getActiveBabyId().then((id) => {
      if (id) setCurrentBabyIdState(id);
      setIsHydrated(true);
    });
  }, []);

  const setCurrentBabyId = useCallback((id: string | null) => {
    setCurrentBabyIdState(id);
    if (id) {
      babiesRepo.setActiveBaby(id);
    } else {
      babiesRepo.clearActiveBaby();
    }
  }, []);

  return (
    <CurrentBabyContext.Provider value={{ currentBabyId, setCurrentBabyId, isHydrated }}>
      {children}
    </CurrentBabyContext.Provider>
  );
}

export function useCurrentBaby(): CurrentBabyContextValue {
  const ctx = useContext(CurrentBabyContext);
  if (!ctx) {
    throw new Error('useCurrentBaby must be used within CurrentBabyProvider');
  }
  return ctx;
}
