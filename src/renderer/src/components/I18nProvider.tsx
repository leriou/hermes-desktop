import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { I18nextProvider, initReactI18next } from "react-i18next";
import {
  APP_LOCALES,
  DEFAULT_ACTIVE_LOCALE,
  setLocale as setSharedLocale,
  sharedI18n,
  type AppLocale,
} from "@shared/i18n";
import { I18nContext, type I18nContextValue } from "./I18nContext";
import {
  getLocale,
  setLocale as setTauriLocale,
} from "@renderer/lib/hermes-tauri";

import { getStoreItem, setStoreItem } from "@renderer/utils/store";

void sharedI18n.use(initReactI18next);

const STORAGE_KEY = "hermes-locale";

function readStoredLocale(): AppLocale {
  try {
    const raw = getStoreItem(STORAGE_KEY);
    if (raw && (APP_LOCALES as string[]).includes(raw)) {
      return raw as AppLocale;
    }
  } catch {
    /* ignore */
  }
  return DEFAULT_ACTIVE_LOCALE;
}

const initialLocale = readStoredLocale();
setSharedLocale(initialLocale);

export function I18nProvider({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  const [locale, setLocaleState] = useState<AppLocale>(initialLocale);
  const [mainLocaleLoaded, setMainLocaleLoaded] = useState(() => !getLocale);
  const userSelectedLocale = useRef(false);

  const setLocale = useCallback((nextLocale: AppLocale) => {
    userSelectedLocale.current = true;
    setLocaleState(nextLocale);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const getMainLocale = getLocale;

    if (!getMainLocale) {
      return;
    }

    void getMainLocale()
      .then((mainLocale) => {
        if (cancelled || !mainLocale || userSelectedLocale.current) return;
        setLocaleState(mainLocale);
      })
      .catch(() => {
        /* ignore */
      })
      .finally(() => {
        if (!cancelled) {
          setMainLocaleLoaded(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!mainLocaleLoaded && !userSelectedLocale.current) return;

    if (sharedI18n.language !== locale) {
      setSharedLocale(locale);
    }
    void setTauriLocale(locale).catch(() => {
      /* ignore */
    });
    try {
      setStoreItem(STORAGE_KEY, locale);
    } catch {
      /* ignore */
    }
  }, [locale, mainLocaleLoaded]);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale,
    }),
    [locale, setLocale],
  );

  return (
    <I18nContext.Provider value={value}>
      <I18nextProvider i18n={sharedI18n}>{children}</I18nextProvider>
    </I18nContext.Provider>
  );
}
