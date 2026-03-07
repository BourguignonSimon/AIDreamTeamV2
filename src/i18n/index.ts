/**
 * i18n Configuration for Operia
 *
 * Supports fr, en, nl languages (SG-06, FR-AUTH-05).
 * The active language is stored in user profile metadata and synced on login (I18N-02).
 * AI content language is controlled by project.language, independent of UI language (I18N-03).
 *
 * Specification: Section 8.4
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './en.json';
import fr from './fr.json';
import nl from './nl.json';

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      fr: { translation: fr },
      nl: { translation: nl },
    },
    lng: 'en',              // Default language; overridden from user profile on login
    fallbackLng: 'en',      // Always fall back to English for missing keys
    interpolation: {
      escapeValue: false,   // React already escapes values
    },
    // Strict mode: fail loudly on missing keys in development
    saveMissing: import.meta.env.DEV,
    missingKeyHandler: (lngs, ns, key) => {
      if (import.meta.env.DEV) {
        console.warn(`[i18n] Missing key: ${key} for languages: ${lngs.join(', ')}`);
      }
    },
  });

export default i18n;

/**
 * Sets the UI language from user profile metadata.
 * Called on successful login.
 */
export function setUILanguage(language: string): void {
  if (['fr', 'en', 'nl'].includes(language)) {
    void i18n.changeLanguage(language);
  }
}
