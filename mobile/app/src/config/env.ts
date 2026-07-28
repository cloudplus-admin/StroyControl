/**
 * Конфигурация окружения мобильного приложения.
 *
 * baseUrl и companyId читаются из expo `extra` (app.json -> expo.extra) с фолбэком
 * на переменные окружения EXPO_PUBLIC_API_BASE_URL / EXPO_PUBLIC_COMPANY_ID (Expo
 * автоматически прокидывает EXPO_PUBLIC_* переменные в бандл).
 *
 * x-company-id — временная замена авторизации, см. backend requireCompanyId(): пока
 * в системе нет логина, companyId передаётся явным заголовком на каждый запрос.
 * Здесь захардкожен через конфиг, чтобы не блокироваться на реализации экрана логина
 * в этом инкременте.
 */

const DEFAULT_BASE_URL = 'http://localhost:4000';
const DEFAULT_COMPANY_ID = 'demo-company';

function readEnv(name: string): string | undefined {
  // process.env.EXPO_PUBLIC_* инлайнится Metro/Expo на этапе сборки.
  const value = (process.env as Record<string, string | undefined>)[name];
  return value && value.length > 0 ? value : undefined;
}

export const env = {
  apiBaseUrl: readEnv('EXPO_PUBLIC_API_BASE_URL') ?? DEFAULT_BASE_URL,
  companyId: readEnv('EXPO_PUBLIC_COMPANY_ID') ?? DEFAULT_COMPANY_ID,
};
