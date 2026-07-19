import { config as loadEnvironment } from 'dotenv'
import { fileURLToPath } from 'node:url'

const environmentName = process.env.NODE_ENV ?? 'development'
const projectRoot = fileURLToPath(new URL('../../../', import.meta.url))

loadEnvironment({
  path: `${projectRoot}.env.${environmentName}`,
  quiet: true,
})

const port = Number(process.env.PORT ?? 3002)

if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  throw new Error(`Invalid PORT value: ${process.env.PORT}`)
}

export const environment = {
  nodeEnv: process.env.NODE_ENV ?? environmentName,
  port,
  clientUrl: process.env.CLIENT_URL ?? 'http://localhost:3001',
  cTraderClientId: process.env.CTRADER_CLIENT_ID ?? '',
  cTraderRedirectUri: process.env.CTRADER_REDIRECT_URI ?? '',
  cTraderEnvironment: process.env.CTRADER_ENVIRONMENT ?? '',
  cTraderClientSecret: process.env.CTRADER_CLIENT_SECRET ?? '',
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN ?? '',
  telegramChatId: process.env.TELEGRAM_CHAT_ID ?? '',
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
  databaseUrl: process.env.DATABASE_URL ?? '',
} as const
